const AttendanceService = require('../services/AttendanceService');
const { prisma } = require('../config/database');
const EmployeePolicy = require('../services/EmployeePolicyService');
const { dateKey } = require('../utils/attendanceClock');
const { getCurrentServerTime } = require('../utils/networkTime');

// GET /api/attendance/current-session
// Returns the active session for the employee's org (used by mobile check-in button)
const getCurrentSession = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        orgId: true, role: true, checkInMethod: true,
        organization: { select: { allowDeviceCheckIn: true, allowManualCheckIn: true } },
      },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role !== 'EMPLOYEE') return res.status(403).json({ success: false, message: 'Employee account required.' });
    EmployeePolicy.assertChannelAllowed(user.organization, user.checkInMethod, 'PHONE');

    const now = await getCurrentServerTime();
    const session = await prisma.attendanceSession.findFirst({
      where: {
        office: { orgId: user.orgId }, status: 'ACTIVE',
        startTime: { lte: now },
        OR: [{ endTime: null }, { endTime: { gt: now } }],
      },
      include: { office: { select: {
        name: true, timezone: true, openTime: true, closeTime: true, lateAfterMinutes: true,
      } } },
      orderBy: { startTime: 'desc' },
    });

    if (!session) {
      return res.status(404).json({ success: false, message: 'No active session for your organization' });
    }

    const elapsed   = (now.getTime() - session.startTime.getTime()) / 60000;
    const remaining = session.endTime ? Math.max(0, (session.endTime.getTime() - now.getTime()) / 60000) : null;

    res.json({
      success: true,
      data: {
        sessionId:        session.id,
        sessionName:      session.sessionName,
        office:           session.office?.name,
        timezone:         session.office?.timezone || 'Africa/Lagos',
        openTime:         session.office?.openTime,
        closeTime:        session.office?.closeTime,
        lateAfterMinutes: session.office?.lateAfterMinutes,
        status:           session.status,
        startTime:        session.startTime,
        endTime:          session.endTime,
        elapsedMinutes:   Math.round(elapsed),
        remainingMinutes: remaining ? Math.round(remaining) : null,
      },
    });
  } catch (err) { next(err); }
};

const REASON_MESSAGES = {
  SESSION_CLOSED:     'No active attendance session. Ask your admin to start a session.',
  DEVICE_REQUIRED:    'Device identification is required to check in.',
  DEVICE_CONFLICT:    'This device is already assigned to another employee.',
  DEVICE_LIMIT:       'You have reached the maximum number of registered devices.',
  DEVICE_NOT_BOUND:   'This device is not registered to you. Check in first.',
  WIFI_REQUIRED:      'Connect to the company Wi-Fi to mark attendance.',
  WIFI_MISMATCH:      'You must be connected to the company Wi-Fi to mark attendance.',
  WIFI_NOT_CONFIGURED:'Your office Wi-Fi has not been set up yet. Contact your administrator.',
  NETWORK_NOT_CONFIGURED: 'Web check-in is not set up for your office yet. Contact your administrator.',
  NETWORK_REQUIRED:   'Could not detect your network. Connect to the office Wi-Fi and try again.',
  NETWORK_MISMATCH:   'You must be on the company network (office Wi-Fi) to check in.',
  CHALLENGE_REQUIRED: 'A verification code is required to check in.',
  CHALLENGE_EXPIRED:  'Your check-in code expired. Tap Check In again.',
  CHALLENGE_FAILED:   'The verification code is incorrect.',
  CHECKIN_CLOSED:     'Check-in window has closed for today.',
  SUNDAY_CLOSED:      'Attendance is not recorded on Sundays.',
};

// GET /api/attendance/network — returns the caller's public IP (for office-IP setup
// and for the web/PWA client to show which network it is on)
const network = async (req, res) => {
  res.json({ success: true, data: { ip: req.ip } });
};

// POST /api/attendance/check-in/challenge — validate network, then issue a one-time code
const issueChallenge = async (req, res, next) => {
  try {
    const { sessionId, wifiSSID, deviceId, platform } = req.body;
    const result = await AttendanceService.issueChallenge(req.user.id, sessionId, { wifiSSID, deviceId, platform, ip: req.ip });
    if (!result.success) {
      const msg = result.message ?? REASON_MESSAGES[result.reason] ?? 'Could not start check-in.';
      return res.status(400).json({ success: false, message: msg, reason: result.reason });
    }
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const checkIn = async (req, res, next) => {
  try {
    const result = await AttendanceService.checkIn(req.user.id, { ...req.body, ip: req.ip });
    if (!result.success) {
      const msg = result.message ?? REASON_MESSAGES[result.reason] ?? `Check-in failed: ${result.reason}`;
      return res.status(400).json({ success: false, message: msg, reason: result.reason });
    }
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const checkOut = async (req, res, next) => {
  try {
    const { sessionId, deviceId, wifiSSID, platform } = req.body;
    const record = await AttendanceService.checkOut(req.user.id, sessionId, { deviceId, wifiSSID, platform, ip: req.ip });
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
};

// POST /api/attendance/heartbeat — periodic Wi-Fi presence ping from the app
const heartbeat = async (req, res, next) => {
  try {
    const { wifiSSID } = req.body;
    const result = await AttendanceService.recordHeartbeat(req.user.id, wifiSSID);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getStatus = async (req, res, next) => {
  try {
    const { date } = req.query;
    const employeeId = req.params.employeeId || req.user.id;
    if (req.params.employeeId) {
      const target = await prisma.user.findFirst({
        where: { id: employeeId, orgId: req.user.orgId, role: 'EMPLOYEE' }, select: { id: true },
      });
      if (!target) return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    const record = await AttendanceService.getStatus(employeeId, date);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
};

const getHistory = async (req, res, next) => {
  try {
    const now = new Date();
    const organization = await prisma.organization.findUnique({ where: { id: req.user.orgId }, select: { timezone: true } });
    const timezone = organization?.timezone || 'Africa/Lagos';
    // History is an audit view: do not hide older retained records by default.
    const startDate = req.query.startDate || '2000-01-01';
    const endDate   = req.query.endDate   || dateKey(now, timezone);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 30));

    if (req.params.employeeId) {
      // Admin requesting a specific employee's history
      const target = await prisma.user.findFirst({
        where: { id: req.params.employeeId, orgId: req.user.orgId, role: 'EMPLOYEE' }, select: { id: true },
      });
      if (!target) return res.status(404).json({ success: false, message: 'Employee not found.' });
      const result = await AttendanceService.getHistory(req.params.employeeId, { startDate, endDate, page, limit });
      return res.json({ success: true, ...result });
    }

    // Admin requesting ALL employees' attendance for their org
    if (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN') {
      const skip = (page - 1) * limit;
      const where = {
        employee: { orgId: req.user.orgId },
        // AttendanceRecord.date is a calendar date, not a timestamp. Compare
        // the requested local date keys directly to avoid timezone shifts.
        date: { gte: new Date(`${startDate}T00:00:00.000Z`), lte: new Date(`${endDate}T00:00:00.000Z`) },
      };
      const [records, total] = await Promise.all([
        prisma.attendanceRecord.findMany({
          where, skip, take: limit,
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, email: true, employeeCode: true, department: { select: { name: true } } } },
            session: { select: { sessionName: true, office: { select: { name: true, timezone: true } } } },
            checkInRecorder: { select: { id: true, firstName: true, lastName: true, email: true } },
            checkOutRecorder: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { date: 'desc' },
        }),
        prisma.attendanceRecord.count({ where }),
      ]);
      return res.json({ success: true, data: records, total, page, totalPages: Math.ceil(total / limit) });
    }

    // Employee requesting their own history
    const result = await AttendanceService.getHistory(req.user.id, { startDate, endDate, page, limit });
    res.json({ success: true, data: result.records, total: result.total, page: result.page, totalPages: result.totalPages });
  } catch (err) { next(err); }
};

const getMonthlyPenalties = async (req, res, next) => {
  try {
    const month = String(req.query.month || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ success: false, message: 'month must use YYYY-MM format.' });
    const [year, monthNumber] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 1));
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const employees = await prisma.user.findMany({
      where: { orgId: req.user.orgId, role: 'EMPLOYEE', status: { not: 'TERMINATED' } },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, department: { select: { name: true } } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    const penalties = await prisma.attendanceRecord.groupBy({
      by: ['employeeId'],
      where: { employee: { orgId: req.user.orgId, role: 'EMPLOYEE' }, date: { gte: start, lt: end } },
      _sum: { penalty: true }, _count: { _all: true },
    });
    const totals = new Map(penalties.map((row) => [row.employeeId, row]));
    res.json({ success: true, data: { month, daysInMonth, employees: employees.map((employee) => ({
      ...employee, totalPenalty: totals.get(employee.id)?._sum.penalty ?? 0, attendanceCount: totals.get(employee.id)?._count._all ?? 0,
    })) } });
  } catch (err) { next(err); }
};

const flagRecord = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const record = await AttendanceService.flagRecord(req.params.recordId, reason, req.user.id, req.user.orgId);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
};

const getLiveAttendance = async (req, res, next) => {
  try {
    const now = await getCurrentServerTime();
    const organization = await prisma.organization.findUnique({ where: { id: req.user.orgId }, select: { timezone: true } });
    const today = new Date(`${dateKey(now, organization?.timezone || 'Africa/Lagos')}T00:00:00.000Z`);
    const records = await prisma.attendanceRecord.findMany({
      where: {
        employee: { orgId: req.user.orgId },
        OR: [
          { date: today },
          { session: { status: 'ACTIVE', office: { orgId: req.user.orgId } } },
        ],
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, email: true, employeeCode: true, role: true, department: { select: { name: true } } } },
        session: { select: { sessionName: true, status: true, office: { select: { name: true, timezone: true } } } },
        checkInRecorder: { select: { id: true, firstName: true, lastName: true, email: true } },
        checkOutRecorder: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ clockInTime: 'desc' }, { date: 'desc' }],
      take: 500,
    });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: records, total: records.length, serverTime: now });
  } catch (err) { next(err); }
};

const approveRecord = async (req, res, next) => {
  try {
    const { notes } = req.body;
    const record = await AttendanceService.approveRecord(req.params.recordId, req.user.id, notes, req.user.orgId);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
};

const getFlagged = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (+page - 1) * +limit;
    const [records, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { flagged: true, employee: { orgId: req.user.orgId } },
        include: { employee: { select: { firstName: true, lastName: true } }, session: { select: { sessionName: true } } },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: +limit,
      }),
      prisma.attendanceRecord.count({ where: { flagged: true, employee: { orgId: req.user.orgId } } }),
    ]);
    res.json({ success: true, data: records, total, page: +page, totalPages: Math.ceil(total / +limit) });
  } catch (err) { next(err); }
};

module.exports = { network, issueChallenge, checkIn, checkOut, heartbeat, getStatus, getHistory, getMonthlyPenalties, getLiveAttendance, flagRecord, approveRecord, getFlagged, getCurrentSession };
