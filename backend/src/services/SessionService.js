const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../config/database');
const { redis, PREFIXES } = require('../config/redis');
const env = require('../config/env');
const QRTokenService = require('./QRTokenService');
const logger = require('../config/logger');
const { atZonedTime, zonedParts, isSunday, officeHoursFor } = require('../utils/attendanceClock');
const { getCurrentServerTime } = require('../utils/networkTime');

const sessionLeadMinutes = () => Math.max(0, Number(env.AUTO_SESSION_LEAD_MIN) || 40);

// Implements the State pattern for AttendanceSession lifecycle.
const VALID_TRANSITIONS = {
  SCHEDULED: ['ACTIVE'],
  ACTIVE:    ['PAUSED', 'LOCKED', 'ENDED'],
  PAUSED:    ['ACTIVE', 'ENDED'],
  LOCKED:    ['ENDED'],
  ENDED:     [],
};

class SessionService {
  async createSession(adminId, config) {
    const { sessionName, officeId, qrRefreshInterval } = config;
    const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { orgId: true } });
    if (!admin) throw Object.assign(new Error('Admin not found'), { status: 404 });

    // Snapshot office + org name and read the office work hours
    const office = await prisma.office.findUnique({
      where: { id: officeId },
      select: { orgId: true, name: true, openTime: true, closeTime: true, weeklySchedule: true, timezone: true, organization: { select: { name: true, openingTime: true } } },
    });
    if (!office || office.orgId !== admin.orgId) throw Object.assign(new Error('Office not found'), { status: 404 });

    const now      = await getCurrentServerTime();
    const hours = officeHoursFor(now, { ...office, organizationOpeningTime: office.organization?.openingTime });
    if (!hours) throw Object.assign(new Error('This office is closed today.'), { status: 400 });
    const openMin  = this._toMinutes(hours.openTime);
    const closeMin = this._toMinutes(hours.closeTime);
    let openAt = null;
    let closeAt = null;

    // Allow an admin to create the session during the configured pre-open lead.
    if (openMin != null) {
      const local = zonedParts(now, office.timezone);
      const localMin = local.hour * 60 + local.minute;
      openAt = atZonedTime(now, hours.openTime, office.timezone);
      closeAt = closeMin != null ? atZonedTime(now, hours.closeTime, office.timezone) : null;
      if (closeAt && closeMin <= openMin) {
        if (localMin < closeMin) openAt = atZonedTime(now, hours.openTime, office.timezone, -1);
        else closeAt = atZonedTime(now, hours.closeTime, office.timezone, 1);
      }
      const createAt = new Date(openAt.getTime() - sessionLeadMinutes() * 60_000);
      if (now < createAt) {
        throw Object.assign(
          new Error(`Too early. Sessions can be created from ${hours.openTime} (${office.timezone}), up to ${Number(env.AUTO_SESSION_LEAD_MIN) || 40} minutes before opening.`),
          { status: 400 }
        );
      }
      if (closeAt && now >= closeAt) {
        throw Object.assign(
          new Error(`The ${hours.closeTime} closing time (${office.timezone}) has passed. A session cannot be created after the work day closes.`),
          { status: 400 }
        );
      }
    }

    // ── Only ONE live session per office per day ──
    const existing = await prisma.attendanceSession.findFirst({
      where: {
        officeId,
        // A workday may have only one session, even after its check-in window
        // has ended. The next session belongs to the next office workday.
        startTime: {
          ...(openAt ? { gte: new Date(openAt.getTime() - sessionLeadMinutes() * 60_000) } : {}),
          ...(closeAt ? { lt: closeAt } : {}),
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw Object.assign(
        new Error('A session already exists for this office today. End it before starting a new one.'),
        { status: 409 }
      );
    }

    const start = openAt ? new Date(openAt.getTime() - sessionLeadMinutes() * 60_000) : now;
    let autoEnd = (closeMin != null) ? atZonedTime(now, hours.closeTime, office.timezone) : new Date(start.getTime() + 8 * 3600 * 1000);
    if (autoEnd <= start && closeMin != null) autoEnd = atZonedTime(now, hours.closeTime, office.timezone, 1);

    // Create as ACTIVE immediately and generate first QR
    const session = await prisma.attendanceSession.create({
      data: {
        id: uuidv4(),
        sessionName,
        officeId,
        officeName: office?.name ?? null,
        orgName:    office?.organization?.name ?? null,
        createdBy: adminId,
        startTime: start,
        endTime: autoEnd,
        qrRefreshInterval:     qrRefreshInterval ?? 120,
        status: 'ACTIVE',
      },
      include: { office: true, creator: { select: { id: true, firstName: true, lastName: true } } },
    });

    // Generate first QR token and schedule rotation
    const token = await QRTokenService.generate(session);
    await QRTokenService.scheduleRotation(session);
    await require('./AttendanceService').syncAdminAttendanceForSession(session.id);
    this._emitEvent('session:started', session);

    logger.info(`Session created+started: ${session.id} | expires at ${autoEnd.toISOString()}`);
    return { session, currentToken: token };
  }

  async startSession(sessionId, orgId) {
    await this._assertWithinOfficeHours(sessionId, orgId);
    const session = await this._transition(sessionId, 'ACTIVE', orgId);
    const token = await QRTokenService.generate(session);
    await QRTokenService.scheduleRotation(session);
    await require('./AttendanceService').syncAdminAttendanceForSession(session.id);
    this._emitEvent('session:started', session);
    return { session, currentToken: token };
  }

  async pauseSession(sessionId, orgId) {
    const session = await this._transition(sessionId, 'PAUSED', orgId);
    await QRTokenService.invalidatePrevious(sessionId);
    this._emitEvent('session:paused', session);
    return session;
  }

  async resumeSession(sessionId, orgId) {
    await this._assertWithinOfficeHours(sessionId, orgId);
    const session = await this._transition(sessionId, 'ACTIVE', orgId);
    const token = await QRTokenService.generate(session);
    await QRTokenService.scheduleRotation(session);
    this._emitEvent('session:resumed', session);
    return { session, currentToken: token };
  }

  async endSession(sessionId, orgId) {
    const session = await this._transition(sessionId, 'ENDED', orgId);
    await QRTokenService.invalidatePrevious(sessionId);
    await redis.del(`${PREFIXES.SESSION}${sessionId}`);
    this._emitEvent('session:ended', session);
    logger.info(`Session ended: ${sessionId}`);
    return session;
  }

  async lockSession(sessionId, orgId) {
    const session = await this._transition(sessionId, 'LOCKED', orgId);
    await QRTokenService.invalidatePrevious(sessionId);
    this._emitEvent('session:locked', session);
    return session;
  }

  async forceRefreshQR(sessionId, orgId) {
    const session = await this._findOwnedSession(sessionId, orgId);
    if (!session || session.status !== 'ACTIVE') {
      throw Object.assign(new Error('Session must be ACTIVE to refresh QR'), { status: 400 });
    }
    await QRTokenService.invalidatePrevious(sessionId);
    const token = await QRTokenService.generate(session);
    await QRTokenService.scheduleRotation(session);
    this._emitEvent('session:qr_refreshed', { sessionId, token });
    return token;
  }

  async getLiveStatus(sessionId, orgId) {
    const session = await prisma.attendanceSession.findFirst({
      where: { id: sessionId, office: { orgId } },
      include: {
        _count: { select: { attendanceRecords: true, scanAttempts: true, fraudAlerts: true } },
      },
    });

    if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });

    const presentCount = await prisma.attendanceRecord.count({
      where: { sessionId, status: { in: ['PRESENT', 'LATE'] } },
    });

    const latestToken = await prisma.qRToken.findFirst({
      where: { sessionId, isConsumed: false },
      orderBy: { generatedAt: 'desc' },
    });

    return {
      session,
      stats: {
        totalRecords: session._count.attendanceRecords,
        present: presentCount,
        scanAttempts: session._count.scanAttempts,
        fraudAlerts: session._count.fraudAlerts,
      },
      qrExpiresIn: latestToken ? QRTokenService.getRemainingSeconds(latestToken) : null,
    };
  }

  async getActiveSessions(officeId, orgId) {
    // Return ALL sessions for the admin's org (full history), most recent first.
    // Active sessions naturally sort to the top by startTime. Past/ENDED sessions
    // are preserved and shown too — nothing is ever hidden or removed.
    const orgFilter = {
      ...(orgId ? { office: { orgId } } : {}),
      ...(officeId ? { officeId } : {}),
    };
    return prisma.attendanceSession.findMany({
      where: orgFilter,
      include: {
        office: { select: {
          id: true, name: true, timezone: true, openTime: true, closeTime: true, lateAfterMinutes: true,
        } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { attendanceRecords: true } },
      },
      orderBy: { startTime: 'desc' },
      take: 200,
    });
  }

  async getCurrentQRImage(sessionId, orgId) {
    await this._findOwnedSession(sessionId, orgId);
    const token = await prisma.qRToken.findFirst({
      where: { sessionId, isConsumed: false, expiresAt: { gt: new Date() } },
      orderBy: { generatedAt: 'desc' },
    });

    if (!token) throw Object.assign(new Error('No active QR token'), { status: 404 });

    const qrBuffer = await QRTokenService.encodeToQRImage(token.tokenValue, sessionId);
    return {
      image: qrBuffer,
      expiresIn: QRTokenService.getRemainingSeconds(token),
      tokenId: token.id,
    };
  }

  // ── private ──────────────────────────────────────────────────────────────────

  _toMinutes(hhmm) {
    if (!hhmm || typeof hhmm !== 'string') return null;
    const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }

  async _assertWithinOfficeHours(sessionId, orgId) {
    const session = await prisma.attendanceSession.findFirst({
      where: { id: sessionId, office: { orgId } },
      select: { office: { select: { openTime: true, closeTime: true, weeklySchedule: true, timezone: true } } },
    });
    if (!session?.office) throw Object.assign(new Error('Session not found'), { status: 404 });

    const now = await getCurrentServerTime();
    const hours = officeHoursFor(now, session.office);
    if (!hours) throw Object.assign(new Error('This office is closed today.'), { status: 400 });
    const openAt = atZonedTime(now, hours.openTime, session.office.timezone);
    let closeAt = atZonedTime(now, hours.closeTime, session.office.timezone);
    const openMin = this._toMinutes(hours.openTime);
    const closeMin = this._toMinutes(hours.closeTime);
    const local = zonedParts(now, session.office.timezone);
    if (closeMin <= openMin && local.hour * 60 + local.minute < closeMin) {
      const previousOpening = atZonedTime(now, hours.openTime, session.office.timezone, -1);
      if (previousOpening) {
        openAt.setTime(previousOpening.getTime());
      }
      closeAt = atZonedTime(now, session.office.closeTime, session.office.timezone, 1);
    }

    if (!openAt || !closeAt || now < openAt || now >= closeAt) {
      throw Object.assign(
        new Error(`Sessions can only be activated between ${hours.openTime} and ${hours.closeTime} (${session.office.timezone}).`),
        { status: 400 }
      );
    }
  }

  async _transition(sessionId, targetStatus, orgId) {
    const session = await this._findOwnedSession(sessionId, orgId);
    if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });

    const allowed = VALID_TRANSITIONS[session.status] || [];
    if (!allowed.includes(targetStatus)) {
      throw Object.assign(
        new Error(`Cannot transition session from ${session.status} to ${targetStatus}`),
        { status: 400 }
      );
    }

    return prisma.attendanceSession.update({
      where: { id: sessionId },
      data: { status: targetStatus },
    });
  }

  async _findOwnedSession(sessionId, orgId) {
    const session = await prisma.attendanceSession.findFirst({
      where: { id: sessionId, ...(orgId ? { office: { orgId } } : {}) },
    });
    if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });
    return session;
  }

  _emitEvent(event, payload) {
    // Attach the socket emitter lazily to avoid circular dependency at boot time.
    if (!this._io) {
      try { this._io = require('../sockets/io').getIO(); } catch { return; }
    }
    if (this._io) this._io.emit(event, payload);
  }
}

module.exports = new SessionService();
