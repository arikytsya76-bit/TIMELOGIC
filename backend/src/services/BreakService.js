const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../config/database');
const NotificationService = require('./NotificationService');
const logger = require('../config/logger');
const { atZonedTime, dayBounds, zonedParts } = require('../utils/attendanceClock');
const { getCurrentServerTime } = require('../utils/networkTime');

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

class BreakService {
  withLifecycleStatus(records) {
    return (Array.isArray(records) ? records : [records]).map((record) => ({
      ...record,
      lifecycleStatus: record.endTime ? (record.isAutoEnded ? 'EXTENDED' : 'ENDED') : 'ACTIVE',
    }));
  }

  async startBreak(employeeId, breakType, notes = null) {
    const record = await prisma.attendanceRecord.findFirst({
      where: { employeeId, clockInTime: { not: null }, clockOutTime: null },
      orderBy: { clockInTime: 'desc' },
      include: { session: { select: { office: { select: { timezone: true } } } } },
    });
    if (!record) throw Object.assign(new Error('No active attendance record for today'), { status: 404 });

    const active = await this.getActiveBreak(employeeId);
    if (active) throw Object.assign(new Error('Already on a break'), { status: 409 });

    const policy = await this._getPolicy(employeeId);

    // ── Enforce the DEPARTMENT's break window (each department has its own) ──
    if (policy?.breakStart && policy?.breakEnd) {
      const now = await getCurrentServerTime();
      const local = zonedParts(now, record.session?.office?.timezone || 'Africa/Lagos');
      const nowMin = local.hour * 60 + local.minute;
      if (nowMin < toMin(policy.breakStart) || nowMin > toMin(policy.breakEnd)) {
        throw Object.assign(
          new Error(`Your department break is only allowed between ${policy.breakStart} and ${policy.breakEnd}.`),
          { status: 400 }
        );
      }
    }

    const serverNow = await getCurrentServerTime();
    const todayBreaks = await this.getDailyBreaks(employeeId, serverNow);
    const check = await this.checkBreakPolicy(employeeId, policy, todayBreaks, breakType);
    if (!check.allowed) throw Object.assign(new Error(check.reason), { status: 400 });

    return prisma.breakRecord.create({
      data: { id: uuidv4(), attendanceRecordId: record.id, employeeId, breakType, startTime: serverNow, notes },
    });
  }

  async startBreakForEmployee(employeeId, breakType, notes = null) {
    return this.startBreak(employeeId, breakType, notes);
  }

  async endBreak(employeeId, breakId, ctx = {}) {
    const breakRecord = await prisma.breakRecord.findFirst({
      where: { id: breakId, employeeId, endTime: null },
      include: { attendanceRecord: { select: { sessionId: true, session: { select: { office: { select: { wifiSSID: true } } } } } } },
    });
    if (!breakRecord) throw Object.assign(new Error('Break not found or already ended'), { status: 404 });

    const endTime = await getCurrentServerTime();
    const durationMinutes = Math.floor((endTime - breakRecord.startTime) / 60000);

    const changed = await prisma.breakRecord.updateMany({
      where: { id: breakId, employeeId, endTime: null },
      data: { endTime, durationMinutes },
    });
    if (!changed.count) throw Object.assign(new Error('Break is already ended'), { status: 409 });
    const updated = await prisma.breakRecord.findUnique({ where: { id: breakId } });
    await prisma.attendanceRecord.update({
      where: { id: breakRecord.attendanceRecordId },
      data: { totalBreakMinutes: { increment: durationMinutes } },
    });

    // The employee is "back" only if they are on the company Wi-Fi. If they end a
    // break while off the office Wi-Fi, raise a fraud alert (they are not actually back).
    const officeWifi = breakRecord.attendanceRecord?.session?.office?.wifiSSID;
    if (officeWifi && ctx.wifiSSID && ctx.wifiSSID !== officeWifi) {
      await this._raiseFraud(employeeId, breakRecord.attendanceRecord.sessionId, 'BREAK_OFF_WIFI',
        `Ended break while connected to "${ctx.wifiSSID}", not the office Wi-Fi "${officeWifi}".`,
        { durationMinutes, gotWifi: ctx.wifiSSID, expectedWifi: officeWifi });
    }

    const policy = await this._getPolicy(employeeId);
    if (policy && durationMinutes > policy.totalDailyBreakLimit) {
      await this._raiseFraud(employeeId, breakRecord.attendanceRecord.sessionId, 'OVERSTAYED_BREAK',
        `Break of ${durationMinutes} min exceeded the daily limit of ${policy.totalDailyBreakLimit} min.`,
        { durationMinutes, limit: policy.totalDailyBreakLimit });
    }

    return updated;
  }

  async getActiveBreak(employeeId) {
    return prisma.breakRecord.findFirst({ where: { employeeId, endTime: null }, orderBy: { startTime: 'desc' } });
  }

  async getDailyBreaks(employeeId, date) {
    const employee = await prisma.user.findUnique({
      where: { id: employeeId }, select: { organization: { select: { timezone: true } } },
    });
    const bounds = dayBounds(date ? new Date(date) : new Date(), employee?.organization?.timezone || 'Africa/Lagos');
    const records = await prisma.breakRecord.findMany({
      where: { employeeId, startTime: { gte: bounds.start, lt: bounds.end } },
      orderBy: { startTime: 'asc' },
    });
    return this.withLifecycleStatus(records);
  }

  async checkBreakPolicy(employeeId, policy, todayBreaks, breakType) {
    if (!policy) return { allowed: true };
    const shortBreaks = todayBreaks.filter((b) => b.breakType === 'SHORT_BREAK' && b.endTime);
    const lunchBreaks = todayBreaks.filter((b) => b.breakType === 'LUNCH' && b.endTime);
    const totalUsed = todayBreaks.reduce((sum, b) => sum + (b.durationMinutes || 0), 0);

    if (breakType === 'LUNCH' && lunchBreaks.length >= 1) return { allowed: false, reason: 'Lunch break already taken today' };
    if (breakType === 'SHORT_BREAK' && shortBreaks.length >= policy.maxShortBreaks) return { allowed: false, reason: `Max ${policy.maxShortBreaks} short breaks per day` };
    if (totalUsed >= policy.totalDailyBreakLimit) return { allowed: false, reason: `Daily break limit of ${policy.totalDailyBreakLimit} minutes reached` };
    return { allowed: true };
  }

  // Runs from the scheduler: any break that runs past its department window end (or
  // the policy auto-end fallback) is force-ended AND flagged as an overstay fraud.
  async autoEndOverdueBreaks() {
    const active = await prisma.breakRecord.findMany({
      where: { endTime: null },
      include: {
        attendanceRecord: { select: { sessionId: true, session: { select: { office: { select: { timezone: true } } } } } },
        employee: { select: { department: { select: { breakPolicy: { select: { breakEnd: true, autoEndAfterMinutes: true } } } } } },
      },
    });

    const now = new Date();
    let count = 0;
    for (const b of active) {
      const pol = b.employee?.department?.breakPolicy;
      const autoAfter = pol?.autoEndAfterMinutes ?? 120;

      // Hard deadline = the department breakEnd today, or startTime + autoAfter, whichever is sooner.
      let deadline = new Date(b.startTime.getTime() + autoAfter * 60000);
      if (pol?.breakEnd) {
        let d = atZonedTime(b.startTime, pol.breakEnd, b.attendanceRecord?.session?.office?.timezone || 'Africa/Lagos');
        if (d < b.startTime) d = atZonedTime(b.startTime, pol.breakEnd, b.attendanceRecord?.session?.office?.timezone || 'Africa/Lagos', 1);
        if (d < deadline) deadline = d;
      }
      if (now <= deadline) continue;

      const durationMinutes = Math.max(1, Math.floor((deadline - b.startTime) / 60000));
      await prisma.breakRecord.update({ where: { id: b.id }, data: { endTime: deadline, durationMinutes, isAutoEnded: true } });
      await prisma.attendanceRecord.update({ where: { id: b.attendanceRecordId }, data: { totalBreakMinutes: { increment: durationMinutes } } });
      if (b.attendanceRecord?.sessionId) {
        await this._raiseFraud(b.employeeId, b.attendanceRecord.sessionId, 'OVERSTAYED_BREAK',
          `Did not return from break on time. Break auto-ended after ${durationMinutes} min${pol?.breakEnd ? ` (window closed ${pol.breakEnd})` : ''}.`,
          { durationMinutes, autoEnded: true });
      }
      count++;
      logger.info(`Auto-ended overstayed break ${b.id} for employee ${b.employeeId}`);
    }
    return count;
  }

  async _raiseFraud(employeeId, sessionId, fraudType, description, evidence) {
    try {
      const alert = await prisma.fraudAlert.create({
        data: { id: uuidv4(), employeeId, sessionId, fraudType, severity: 'HIGH', description, evidence, status: 'NEW' },
      });
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', status: 'ACTIVE', id: { not: employeeId } },
        select: { id: true, orgId: true },
      });
      const emp = await prisma.user.findUnique({ where: { id: employeeId }, select: { orgId: true } });
      for (const a of admins) {
        if (a.orgId === emp?.orgId) await NotificationService.notifyAdmin(a.id, `Fraud alert: ${description}`).catch(() => {});
      }
      return alert;
    } catch (err) {
      logger.warn('Could not raise break fraud alert:', err.message);
      return null;
    }
  }

  async _getPolicy(employeeId) {
    const user = await prisma.user.findUnique({
      where: { id: employeeId },
      include: { department: { include: { breakPolicy: true } } },
    });
    return user?.department?.breakPolicy ?? null;
  }
}

module.exports = new BreakService();
