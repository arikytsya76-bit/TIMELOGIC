const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { redis, PREFIXES } = require('../config/redis');
const env = require('../config/env');
const logger = require('../config/logger');
const EmployeePolicy = require('./EmployeePolicyService');
const { dateOnly, evaluateAttendance, attendanceDate, isSunday, openingOccurrence, atZonedTime, officeHoursFor } = require('../utils/attendanceClock');
const { getCurrentServerTime } = require('../utils/networkTime');

const CHALLENGE_TTL_SECONDS = 120; // code valid for 2 minutes

class AttendanceService {
  // ── CHALLENGE (anti-automation) ───────────────────────────────────────────────
  // Step 1 of check-in: validate the Wi-Fi FIRST, then issue a short-lived random
  // code the employee must type back. If they're on the wrong network, no code is
  // issued — they're told to connect to the company Wi-Fi instead.
  async issueChallenge(employeeId, sessionId, ctx = {}) {
    const employee = await this._loadEmployeeForChannel(employeeId, 'PHONE');
    // Session must exist and be active to issue a challenge
    const session = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true, status: true, startTime: true, endTime: true,
        office: { select: { id: true, orgId: true, isActive: true, wifiSSID: true, publicIp: true, timezone: true, weeklySchedule: true, securitySettings: true } },
      },
    });
    const challengeTime = await getCurrentServerTime();
    if (session?.office && !officeHoursFor(challengeTime, session.office)) return { success: false, reason: 'SUNDAY_CLOSED', message: 'This office is closed today.' };
    if (
      !session || session.status !== 'ACTIVE' || !session.office?.isActive ||
      challengeTime < session.startTime || (session.endTime && challengeTime > session.endTime)
    ) {
      return { success: false, reason: 'SESSION_CLOSED', message: 'No active attendance session. Ask your admin to start a session.' };
    }
    if (session.office.orgId !== employee.orgId) {
      return { success: false, reason: 'SESSION_CLOSED', message: 'This attendance session does not belong to your organization.' };
    }

    // Gate: must be on the company Wi-Fi BEFORE we reveal a code
    const wifi = this._checkWifi(session.office, ctx, employeeId);
    if (!wifi.ok) {
      return { success: false, reason: wifi.reason, message: wifi.message };
    }

    const code = String(Math.floor(100000 + Math.random() * 900000)); // random 6-digit
    const key = `${PREFIXES.CHALLENGE}${employeeId}`;
    const payload = JSON.stringify({ code, sessionId });
    try {
      await redis.set(key, payload, 'EX', CHALLENGE_TTL_SECONDS);
    } catch (err) {
      logger.error('Challenge store failed:', err.message);
      return { success: false, reason: 'CHALLENGE_REQUIRED', message: 'Could not start check-in. Try again.' };
    }
    return { success: true, code, expiresIn: CHALLENGE_TTL_SECONDS };
  }

  // Wi-Fi validation, shared by issueChallenge and the check-in pipeline.
  // Each office enforces ITS OWN configured SSID only — no global/cross-org fallback.
  _checkWifi(office, ctx, employeeId) {
    const settings = office?.securitySettings ?? {};
    const wifiRequired = settings.wifiRequired !== false; // default on
    if (!wifiRequired) return { ok: true, verified: false };

    // ── Web / PWA (iOS): browsers can't read the Wi-Fi SSID, so verify the office
    //    NETWORK by source IP. Employees on the office Wi-Fi share its public IP. ──
    if (ctx.platform === 'web') {
      const expectedIp = (office?.publicIp || '').trim();
      if (!expectedIp) {
        return {
          ok: false, reason: 'NETWORK_NOT_CONFIGURED',
          message: 'Web check-in is not set up for your office yet. Ask your admin to set the office network IP in Security Settings.',
        };
      }
      const gotIp = (ctx.ip || '').trim();
      if (!gotIp) {
        return { ok: false, reason: 'NETWORK_REQUIRED', message: 'Could not detect your network. Connect to the office Wi-Fi and try again.' };
      }
      if (gotIp !== expectedIp) {
        logger.warn(`Network mismatch: employee ${employeeId} from "${gotIp}" expected "${expectedIp}"`);
        return { ok: false, reason: 'NETWORK_MISMATCH', message: 'You must be on the company network (office Wi-Fi) to check in.' };
      }
      return { ok: true, verified: true };
    }

    // ── Native app (Android): SSID check ──
    const expected = (office?.wifiSSID || '').trim();
    // Wi-Fi is required but the org hasn't set its SSID yet → we cannot verify, so
    // we must NOT let anyone through. Admin has to set it in Security Settings.
    if (!expected) {
      return {
        ok: false, reason: 'WIFI_NOT_CONFIGURED',
        message: 'Your office Wi-Fi has not been set up yet. Please contact your administrator.',
      };
    }

    const got = (ctx.wifiSSID || '').trim();

    if (!got) {
      logger.warn(`WiFi: employee ${employeeId} sent no SSID (expected "${expected}")`);
      return {
        ok: false, reason: 'WIFI_REQUIRED',
        message: `Couldn't detect your Wi-Fi. Turn ON Location/GPS, grant location permission, and connect to "${expected}", then try again.`,
      };
    }
    if (got.toLowerCase() !== expected.toLowerCase()) {
      logger.warn(`WiFi mismatch: employee ${employeeId} on "${got}" but expected "${expected}"`);
      return {
        ok: false, reason: 'WIFI_MISMATCH',
        message: `You are connected to "${got}". Please connect to the company Wi-Fi "${expected}" to check in.`,
      };
    }
    return { ok: true, verified: true };
  }

  // Auto-learn the office public IP from a Wi-Fi-VERIFIED native check-in.
  // Only trusts a check-in whose SSID matched the office network, so the IP is
  // genuinely the office's. Keeps office.publicIp current for iOS/web (PWA)
  // employees with zero manual setup, across unlimited organizations.
  async _learnOfficeIp(office, ctx) {
    if (!office || ctx.platform === 'web') return;            // never learn from web
    const ssid = (office.wifiSSID || '').trim();
    const got  = (ctx.wifiSSID || '').trim();
    const ip   = (ctx.ip || '').trim();
    if (!ssid || !ip) return;                                  // need a verified SSID + an IP
    if (got.toLowerCase() !== ssid.toLowerCase()) return;      // not actually on the office Wi-Fi
    if (office.publicIp === ip) return;                        // already current
    try {
      await prisma.office.update({ where: { id: office.id }, data: { publicIp: ip } });
      logger.info(`Auto-learned office IP for office ${office.id}: ${ip}`);
    } catch (err) {
      logger.warn('Could not auto-learn office IP:', err.message);
    }
  }

  // ── ADMIN ATTENDANCE (anti-cheat) ───────────────────────────────────────────
  // Every explicit admin login is stored. The first login of the organization’s
  // local day is authoritative for attendance and uses the same opening-time,
  // grace, late, and penalty rules as employee attendance.
  async recordAdminLogin(adminId, loginAt = null, context = {}) {
    loginAt = loginAt ?? await getCurrentServerTime();
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: {
        id: true, orgId: true, role: true, status: true,
        organization: {
          select: {
            id: true, openingTime: true, timezone: true,
            offices: {
              where: { isActive: true }, orderBy: { createdAt: 'asc' }, take: 1,
              select: { id: true, closeTime: true, graceMinutes: true, lateAfterMinutes: true, gracePenalty: true, latePenalty: true, completelyLatePenalty: true },
            },
          },
        },
      },
    });
    if (!admin || admin.role !== 'ADMIN' || admin.status !== 'ACTIVE') return null;

    if (isSunday(loginAt, admin.organization.timezone)) return null;

    const officeRules = admin.organization.offices[0] ?? {};
    const evaluation = evaluateAttendance(loginAt, {
      ...officeRules,
      openTime: admin.organization.openingTime,
      timezone: admin.organization.timezone,
      graceMinutes: 20,
      lateAfterMinutes: 20,
    });
    const event = await prisma.adminLoginEvent.create({
      data: {
        id: uuidv4(), adminId, orgId: admin.orgId, loggedInAt: loginAt,
        attendanceStatus: evaluation.status,
        minutesLate: evaluation.minutesLate,
        penalty: evaluation.penalty,
        ipAddress: context.ipAddress || null,
        userAgent: context.userAgent ? String(context.userAgent).slice(0, 500) : null,
      },
    });

    try {
      await redis.set(`${PREFIXES.ADMIN_PRESENT}${adminId}`, String(loginAt.getTime()), 'NX', 'EX', 86400);
    } catch (_) { /* optional cache; the database event is authoritative */ }

    const activeSession = officeRules.id ? await prisma.attendanceSession.findFirst({
      where: {
        officeId: officeRules.id,
        status: 'ACTIVE',
        startTime: { lte: loginAt },
        OR: [{ endTime: null }, { endTime: { gt: loginAt } }],
      },
      orderBy: { startTime: 'desc' },
      select: { id: true },
    }) : null;
    if (activeSession) await this.syncAdminAttendanceForSession(activeSession.id, adminId);

    return {
      loggedInAt: event.loggedInAt,
      status: event.attendanceStatus,
      minutesLate: event.minutesLate,
      penalty: event.penalty,
      openingTime: admin.organization.openingTime,
      timezone: admin.organization.timezone,
      sessionId: activeSession?.id ?? null,
    };
  }

  async syncAdminAttendanceForSession(sessionId, onlyAdminId = null) {
    const session = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        office: { select: { id: true, orgId: true, timezone: true, openTime: true, closeTime: true, weeklySchedule: true } },
      },
    });
    if (!session?.office) return;
    const timezone = session.office.timezone || 'Africa/Lagos';
    const hours = officeHoursFor(session.startTime, session.office);
    const workPolicy = {
      openTime: hours?.openTime || session.office.openTime,
      closeTime: hours?.closeTime || session.office.closeTime,
      timezone,
    };
    const recordDate = attendanceDate(session.startTime, {
      ...workPolicy,
      openingReference: session.startTime,
    });
    const now = await getCurrentServerTime();
    if (!officeHoursFor(session.startTime, session.office)) return;
    const candidateStart = new Date(session.startTime.getTime() - 24 * 60 * 60 * 1000);
    const candidateEnd = new Date((session.endTime || session.startTime).getTime() + 24 * 60 * 60 * 1000);
    const admins = await prisma.user.findMany({
      where: {
        orgId: session.office.orgId, role: 'ADMIN', status: 'ACTIVE',
        ...(onlyAdminId ? { id: onlyAdminId } : {}),
      },
      select: { id: true },
    });

    for (const admin of admins) {
      const loginCandidates = await prisma.adminLoginEvent.findMany({
        where: { adminId: admin.id, loggedInAt: { gte: candidateStart, lt: candidateEnd } },
        orderBy: { loggedInAt: 'asc' },
      });
      const firstLogin = loginCandidates.find((event) => (
        attendanceDate(event.loggedInAt, workPolicy).getTime() === recordDate.getTime()
      ));
      if (!firstLogin) {
        const opening = openingOccurrence(now, workPolicy.openTime, timezone, workPolicy.closeTime, session.startTime);
        const lateCutoff = opening ? new Date(opening.getTime() + 20 * 60000) : null;
        if (!lateCutoff || now < lateCutoff) continue;
        await prisma.attendanceRecord.upsert({
          where: { employeeId_sessionId_date: { employeeId: admin.id, sessionId, date: recordDate } },
          create: {
            id: uuidv4(), employeeId: admin.id, sessionId, date: recordDate,
            status: 'LATE', checkInSource: 'ADMIN_LOGIN', penalty: 0,
          },
          update: {},
        });
        continue;
      }
      await prisma.attendanceRecord.upsert({
        where: { employeeId_sessionId_date: { employeeId: admin.id, sessionId, date: recordDate } },
        create: {
          id: uuidv4(), employeeId: admin.id, sessionId, date: recordDate,
          clockInTime: firstLogin.loggedInAt,
          status: firstLogin.attendanceStatus,
          penalty: firstLogin.penalty,
          checkInSource: 'ADMIN_LOGIN',
        },
        update: {
          clockInTime: firstLogin.loggedInAt,
          status: firstLogin.attendanceStatus,
          penalty: firstLogin.penalty,
          checkInSource: 'ADMIN_LOGIN',
        },
      });
    }
  }

  // ── WiFi HEARTBEAT ──────────────────────────────────────────────────────────
  // The app pings this periodically while the employee is clocked in. It tracks
  // live presence, and when someone on break returns to the office Wi-Fi it ends
  // the break automatically (the overstay sweep handles those who never return).
  async recordHeartbeat(employeeId, wifiSSID) {
    const record = await prisma.attendanceRecord.findFirst({
      where: { employeeId, clockInTime: { not: null }, clockOutTime: null },
      orderBy: { clockInTime: 'desc' },
      include: { session: { select: { id: true, office: { select: { wifiSSID: true } } } } },
    });
    if (!record) return { tracked: false, onWifi: null }; // not clocked in / already out

    const expected = (record.session?.office?.wifiSSID || '').trim();
    const got = (wifiSSID || '').trim();
    const onWifi = expected ? got.toLowerCase() === expected.toLowerCase() : !!got;

    // Live presence (ephemeral, 3-minute TTL)
    try {
      await redis.set(`${PREFIXES.PRESENCE}${employeeId}`,
        JSON.stringify({ onWifi, ssid: got || null, at: Date.now() }), 'EX', 180);
    } catch (_) { /* presence is best-effort */ }

    // Returning to Wi-Fi does not end a break. The employee must press Break Over
    // so the exact return time and any overstay penalty are recorded.
    let breakEnded = false;
    return { tracked: true, onWifi, breakEnded };
  }

  async _verifyChallenge(employeeId, sessionId, submittedCode) {
    const key = `${PREFIXES.CHALLENGE}${employeeId}`;
    let stored;
    try {
      stored = await redis.get(key);
    } catch (err) {
      logger.error('Challenge read failed:', err.message);
      return { ok: false, reason: 'CHALLENGE_REQUIRED', message: 'Could not verify your code. Try again.' };
    }
    if (!stored) {
      return { ok: false, reason: 'CHALLENGE_EXPIRED', message: 'Your check-in code expired. Tap Check In again to get a new code.' };
    }
    const { code, sessionId: challengeSession } = JSON.parse(stored);
    if (!submittedCode || String(submittedCode).trim() !== code || challengeSession !== sessionId) {
      return { ok: false, reason: 'CHALLENGE_FAILED', message: 'The code you entered is incorrect. Please try again.' };
    }
    // One-time use — consume it
    await redis.del(key).catch(() => {});
    return { ok: true };
  }

  // ── CHECK IN ────────────────────────────────────────────────────────────────
  async checkIn(employeeId, scanData) {
    const { sessionId, deviceId, wifiSSID, challengeCode, platform, model, ip } = scanData;
    const employee = await this._loadEmployeeForChannel(employeeId, 'PHONE');
    const clockInTime = await getCurrentServerTime();

    // Load session + office + security settings in one query
    const session = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true, status: true, startTime: true, endTime: true,
        office: {
          select: {
            id: true, orgId: true, name: true, isActive: true, timezone: true,
            wifiSSID: true, publicIp: true, openTime: true, closeTime: true, weeklySchedule: true,
            graceMinutes: true, lateAfterMinutes: true, gracePenalty: true, latePenalty: true, completelyLatePenalty: true,
            securitySettings: true,
          },
        },
      },
    });

    if (
      !session || session.status !== 'ACTIVE' || !session.office?.isActive ||
      clockInTime < session.startTime || (session.endTime && clockInTime > session.endTime)
    ) {
      return { success: false, reason: 'SESSION_CLOSED' };
    }
    if (!officeHoursFor(clockInTime, session.office)) return { success: false, reason: 'SUNDAY_CLOSED', message: 'This office is closed today.' };
    if (session.office.orgId !== employee.orgId) {
      return { success: false, reason: 'SESSION_CLOSED', message: 'This attendance session does not belong to your organization.' };
    }

    // The session starts AUTO_SESSION_LEAD_MIN before official opening. Keep
    // accepting check-ins until office close; lateness is applied below.
    // Prevent duplicate check-in on same session/day
    // ── STEP 0: Time-based challenge (anti-automation) ──
    const challenge = await this._verifyChallenge(employeeId, sessionId, challengeCode);
    if (!challenge.ok) {
      return { success: false, reason: challenge.reason, message: challenge.message };
    }

    // ── Verification pipeline (device binding → network) ──
    const ctx = { deviceId, wifiSSID, platform, model, ip };
    const check = await this._verifyContext({
      employeeId,
      office: session.office,
      ctx,
      registerIfNew: true,
    });
    if (!check.ok) {
      return { success: false, reason: check.reason, message: check.message };
    }

    // ── Auto-learn the office public IP from a VERIFIED Android check-in ──
    // The SSID check proves this device is on the office Wi-Fi, so its public IP
    // IS the office's. We store it so iOS/web (PWA) employees on the same Wi-Fi
    // can be verified by IP. Self-healing: tracks dynamic IP changes daily.
    await this._learnOfficeIp(session.office, ctx);
    // ── Attendance rules: status + penalty ──
    const { status, penalty } = this._computeStatusAndPenalty(clockInTime, session);
    const today = attendanceDate(clockInTime, {
      ...session.office,
      openingReference: session.startTime,
    });

    // ── Persist the record ──
    const record = await this._persistCheckIn({
      employeeId, sessionId, date: today, clockInTime, status, penalty,
      checkInSource: 'PHONE', scanResult: 'VALID',
      wifiVerified: check.wifiVerified, deviceVerified: check.deviceVerified,
      deviceId: deviceId ?? null, wifiSSID: wifiSSID ?? null,
    });

    this._emit('attendance:checkin', { record, sessionId });
    return { success: true, record, status, penalty, clockInTime, timezone: session.office.timezone || 'Africa/Lagos' };
  }

  // ── CHECK OUT ─────────────────────────────────────────────────────────────────
  async checkOut(employeeId, sessionId, ctx = {}) {
    const employee = await this._loadEmployeeForChannel(employeeId, 'PHONE');

    // Resolve the record (sessionId optional)
    const record = await prisma.attendanceRecord.findFirst({
      where: {
        employeeId,
        ...(sessionId ? { sessionId } : {}),
        clockInTime: { not: null },
        clockOutTime: null,
      },
      orderBy: { clockInTime: 'desc' },
      include: {
        session: {
          select: {
            id: true,
            startTime: true,
            office: {
              select: {
                id: true, orgId: true, name: true, wifiSSID: true, publicIp: true,
                openTime: true, closeTime: true, weeklySchedule: true, timezone: true,
                securitySettings: true,
              },
            },
          },
        },
      },
    });

    if (!record) throw Object.assign(new Error('No check-in record found for today'), { status: 404 });
    if (record.clockOutTime) throw Object.assign(new Error('Already clocked out'), { status: 409 });
    if (record.session.office?.orgId !== employee.orgId) {
      throw Object.assign(new Error('Attendance record not found.'), { status: 404 });
    }

    const clockOutTime = await getCurrentServerTime();
    const office = record.session.office;
    this._assertCheckoutAllowed(record, clockOutTime);

    // ── Same device / wifi / geo enforcement on the way out ──
    const check = await this._verifyContext({
      employeeId,
      office: record.session.office,
      ctx,
      registerIfNew: false,
    });
    if (!check.ok) {
      const err = new Error(check.message);
      err.status = 403; err.reason = check.reason;
      throw err;
    }

    const workMs = clockOutTime - record.clockInTime;
    const totalWorkHours = parseFloat((workMs / 3600000).toFixed(2));

    const changed = await prisma.attendanceRecord.updateMany({
      where: { id: record.id, clockOutTime: null },
      data: { clockOutTime, totalWorkHours, checkOutSource: 'PHONE' },
    });
    if (!changed.count) throw Object.assign(new Error('Already clocked out'), { status: 409 });
    const updated = await prisma.attendanceRecord.findUnique({
      where: { id: record.id },
      include: { session: { select: { office: { select: { timezone: true } } } } },
    });

    this._emit('attendance:checkout', { record: updated, sessionId: record.sessionId });
    return updated;
  }

  async getManualDashboard(adminOrgId, { sessionId, search = '', page = 1, limit = 100 } = {}) {
    const organization = await EmployeePolicy.getOrganizationPolicy(adminOrgId);
    const now = await getCurrentServerTime();
    const activeSessions = await prisma.attendanceSession.findMany({
      where: {
        office: { orgId: adminOrgId, isActive: true },
        status: 'ACTIVE',
        startTime: { lte: now },
        OR: [{ endTime: null }, { endTime: { gt: now } }],
      },
      select: {
        id: true, sessionName: true, startTime: true, endTime: true,
        office: {
          select: {
            id: true, name: true, timezone: true, openTime: true, closeTime: true,
            graceMinutes: true, lateAfterMinutes: true, gracePenalty: true, latePenalty: true, completelyLatePenalty: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });
    const selectedSession = sessionId
      ? activeSessions.find((session) => session.id === sessionId)
      : activeSessions[0];
    if (sessionId && !selectedSession) {
      throw Object.assign(new Error('Active session not found for this organization.'), { status: 404 });
    }

    if (!organization.allowManualCheckIn) {
      return {
        enabled: false, serverTime: now, organization,
        activeSessions, selectedSession: selectedSession ?? null,
        employees: [], total: 0, page: 1, totalPages: 0,
      };
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
    const where = {
      orgId: adminOrgId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      checkInMethod: { in: ['MANUAL', 'BOTH'] },
      ...(search ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { employeeCode: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const recordDate = selectedSession ? attendanceDate(now, {
      ...selectedSession.office,
      openingReference: selectedSession.startTime,
    }) : null;
    const [employees, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, firstName: true, lastName: true, employeeCode: true,
          email: true, checkInMethod: true, phone: true,
          profileImageUrl: true,
          department: { select: { name: true } },
          attendanceRecords: selectedSession ? {
            where: { sessionId: selectedSession.id, date: recordDate },
            take: 1,
            select: {
              id: true, sessionId: true, clockInTime: true, clockOutTime: true, status: true,
              penalty: true, checkInSource: true, checkOutSource: true,
              checkInRecorder: { select: { id: true, firstName: true, lastName: true } },
              checkOutRecorder: { select: { id: true, firstName: true, lastName: true } },
              session: { select: { office: { select: { name: true, timezone: true } } } },
            },
          } : false,
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      prisma.user.count({ where }),
    ]);
    const openRecords = employees.length ? await prisma.attendanceRecord.findMany({
      where: {
        employeeId: { in: employees.map((employee) => employee.id) },
        clockInTime: { not: null },
        clockOutTime: null,
        session: { office: { orgId: adminOrgId } },
      },
      orderBy: { clockInTime: 'desc' },
      select: {
        id: true, employeeId: true, sessionId: true,
        clockInTime: true, clockOutTime: true, status: true, penalty: true,
        checkInSource: true, checkOutSource: true,
        checkInRecorder: { select: { id: true, firstName: true, lastName: true } },
        checkOutRecorder: { select: { id: true, firstName: true, lastName: true } },
        session: { select: { office: { select: { name: true, timezone: true } } } },
      },
    }) : [];
    const openByEmployee = new Map();
    for (const record of openRecords) {
      if (!openByEmployee.has(record.employeeId)) openByEmployee.set(record.employeeId, record);
    }
    return {
      enabled: true, serverTime: now, organization,
      activeSessions, selectedSession: selectedSession ?? null,
      employees: employees.map((employee) => ({
        ...employee,
        attendance: openByEmployee.get(employee.id) ?? employee.attendanceRecords?.[0] ?? null,
        attendanceRecords: undefined,
      })),
      total, page: safePage, totalPages: Math.ceil(total / safeLimit),
    };
  }

  async manualCheckIn(adminId, adminOrgId, { employeeId, sessionId, password }) {
    const clockInTime = await getCurrentServerTime();
    const employee = await this._loadEmployeeForChannel(employeeId, 'MANUAL', true);
    if (employee.orgId !== adminOrgId) {
      throw Object.assign(new Error('Employee not found.'), { status: 404 });
    }
    if (!password || !(await bcrypt.compare(password, employee.passwordHash))) {
      throw Object.assign(new Error('Employee password is incorrect.'), { status: 403 });
    }
    const session = await this._loadManualSession(sessionId, adminOrgId, clockInTime);
    if (!officeHoursFor(clockInTime, session.office)) throw Object.assign(new Error('This office is closed today.'), { status: 400 });

    const { status, penalty } = this._computeStatusAndPenalty(clockInTime, session);
    const record = await this._persistCheckIn({
      employeeId, sessionId, date: attendanceDate(clockInTime, {
        ...session.office,
        openingReference: session.startTime,
      }),
      clockInTime, status, penalty,
      checkInSource: 'MANUAL', checkInRecordedById: adminId,
      wifiVerified: false, deviceVerified: false,
    });
    this._emit('attendance:checkin', { record, sessionId, source: 'MANUAL' });
    return { record, status, penalty, clockInTime };
  }

  async manualCheckOut(adminId, adminOrgId, { employeeId, sessionId, password }) {
    const employee = await this._loadEmployeeForChannel(employeeId, 'MANUAL', true);
    if (employee.orgId !== adminOrgId) {
      throw Object.assign(new Error('Employee not found.'), { status: 404 });
    }
    if (!password || !(await bcrypt.compare(password, employee.passwordHash))) {
      throw Object.assign(new Error('Employee password is incorrect.'), { status: 403 });
    }
    const record = await prisma.attendanceRecord.findFirst({
      where: {
        employeeId,
        ...(sessionId ? { sessionId } : {}),
        clockInTime: { not: null },
        clockOutTime: null,
        session: { office: { orgId: adminOrgId } },
      },
      orderBy: { clockInTime: 'desc' },
      include: {
        session: {
          select: {
            startTime: true,
            office: { select: { orgId: true, openTime: true, closeTime: true, weeklySchedule: true, timezone: true } },
          },
        },
      },
    });
    if (!record) throw Object.assign(new Error('No open attendance record found for this employee.'), { status: 404 });
    const clockOutTime = await getCurrentServerTime();
    this._assertCheckoutAllowed(record, clockOutTime);
    const totalWorkHours = parseFloat(((clockOutTime - record.clockInTime) / 3600000).toFixed(2));
    const changed = await prisma.attendanceRecord.updateMany({
      where: { id: record.id, clockOutTime: null },
      data: {
        clockOutTime, totalWorkHours,
        checkOutSource: 'MANUAL', checkOutRecordedById: adminId,
      },
    });
    if (!changed.count) throw Object.assign(new Error('Employee is already checked out.'), { status: 409 });
    const updated = await prisma.attendanceRecord.findUnique({ where: { id: record.id } });
    this._emit('attendance:checkout', { record: updated, sessionId: record.sessionId, source: 'MANUAL' });
    return { record: updated, clockOutTime: updated.clockOutTime };
  }

  _assertCheckoutAllowed(record, clockOutTime) {
    const office = record.session?.office;
    if (!office?.closeTime) return;
    const hours = officeHoursFor(clockOutTime, office);
    if (!hours) throw Object.assign(new Error('This office is closed today.'), { status: 400, reason: 'SUNDAY_CLOSED' });

    const opening = openingOccurrence(
      record.session.startTime,
      hours.openTime,
      office.timezone,
      hours.closeTime,
      record.session.startTime,
    );
    let closeAt = atZonedTime(record.session.startTime, hours.closeTime, office.timezone);
    if (opening && closeAt && closeAt <= opening) {
      closeAt = atZonedTime(record.session.startTime, hours.closeTime, office.timezone, 1);
    }
    if (closeAt && clockOutTime < closeAt) {
      throw Object.assign(
        new Error(`Check-out is available after the organisation closes at ${hours.closeTime} (${office.timezone || 'Africa/Lagos'}).`),
        { status: 400, reason: 'CHECKOUT_TOO_EARLY' }
      );
    }
  }

  async _loadEmployeeForChannel(employeeId, channel, includePassword = false) {
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      select: {
        id: true, orgId: true, role: true, status: true, checkInMethod: true,
        profileImageUrl: true,
        faceEncodingData: true,
        faceBlockedUntil: true,
        ...(
          includePassword ? { passwordHash: true } : {}
        ),
        organization: {
          select: {
            id: true, allowDeviceCheckIn: true, allowManualCheckIn: true,
            hasStudents: true, openingTime: true, timezone: true,
          },
        },
      },
    });
    if (!employee || employee.role !== 'EMPLOYEE' || employee.status !== 'ACTIVE') {
      throw Object.assign(new Error('Active employee account not found.'), { status: 403 });
    }
    EmployeePolicy.assertChannelAllowed(employee.organization, employee.checkInMethod, channel);
    return employee;
  }

  async _loadManualSession(sessionId, orgId, now) {
    const session = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true, status: true, startTime: true, endTime: true,
        office: {
          select: {
            id: true, orgId: true, isActive: true, timezone: true, openTime: true, closeTime: true, weeklySchedule: true,
            graceMinutes: true, lateAfterMinutes: true, gracePenalty: true, latePenalty: true, completelyLatePenalty: true,
          },
        },
      },
    });
    if (
      !session || session.status !== 'ACTIVE' || !session.office?.isActive ||
      session.office.orgId !== orgId || now < session.startTime ||
      (session.endTime && now > session.endTime)
    ) {
      throw Object.assign(new Error('No active attendance session was found for this organization.'), { status: 400 });
    }
    return session;
  }

  async _persistCheckIn(data) {
    const key = {
      employeeId_sessionId_date: {
        employeeId: data.employeeId,
        sessionId: data.sessionId,
        date: data.date,
      },
    };
    const existing = await prisma.attendanceRecord.findUnique({ where: key });
    if (existing?.clockInTime) {
      throw Object.assign(new Error('Already clocked in for this session today.'), { status: 409 });
    }
    const recordData = {
      clockInTime: data.clockInTime,
      status: data.status,
      penalty: data.penalty,
      checkInSource: data.checkInSource,
      checkInRecordedById: data.checkInRecordedById ?? null,
      scanResult: data.scanResult ?? null,
      wifiVerified: data.wifiVerified ?? false,
      deviceVerified: data.deviceVerified ?? false,
      deviceId: data.deviceId ?? null,
      wifiSSID: data.wifiSSID ?? null,
    };
    if (existing) {
      const changed = await prisma.attendanceRecord.updateMany({
        where: { id: existing.id, clockInTime: null },
        data: recordData,
      });
      if (!changed.count) {
        throw Object.assign(new Error('Already clocked in for this session today.'), { status: 409 });
      }
      return prisma.attendanceRecord.findUnique({ where: { id: existing.id } });
    }
    try {
      return await prisma.attendanceRecord.create({
        data: {
          id: uuidv4(), employeeId: data.employeeId, sessionId: data.sessionId,
          date: data.date, ...recordData,
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw Object.assign(new Error('Already clocked in for this session today.'), { status: 409 });
      }
      throw error;
    }
  }

  // ── Verification pipeline: Device Binding → Wi-Fi → Geo-fence ──────────────────
  async _verifyContext({ employeeId, office, ctx, registerIfNew }) {
    const settings = office?.securitySettings ?? {};
    let deviceVerified = false;
    let wifiVerified = false;

    // ── STEP 1: Device Binding ──
    const deviceBindingEnabled = settings.deviceBindingEnabled !== false; // default on
    if (deviceBindingEnabled) {
      if (!ctx.deviceId) {
        return { ok: false, reason: 'DEVICE_REQUIRED', message: 'Device identification is required to check in.' };
      }

      // Is this physical device already bound to a *different* employee?
      const boundElsewhere = await prisma.registeredDevice.findFirst({
        where: { deviceFingerprint: ctx.deviceId, isActive: true, employeeId: { not: employeeId } },
        select: { id: true },
      });
      if (boundElsewhere) {
        return { ok: false, reason: 'DEVICE_CONFLICT', message: 'This device is already assigned to another employee.' };
      }

      // Already registered to this employee?
      const mine = await prisma.registeredDevice.findFirst({
        where: { deviceFingerprint: ctx.deviceId, employeeId, isActive: true },
        select: { id: true },
      });

      if (mine) {
        await prisma.registeredDevice.update({ where: { id: mine.id }, data: { lastUsedAt: new Date() } });
        deviceVerified = true;
      } else if (registerIfNew) {
        // First time this employee uses this device → bind it (respect max devices)
        const maxDevices = settings.maxDevicesPerEmployee ?? 2;
        const activeCount = await prisma.registeredDevice.count({ where: { employeeId, isActive: true } });
        if (activeCount >= maxDevices) {
          return { ok: false, reason: 'DEVICE_LIMIT', message: `You have reached the maximum of ${maxDevices} registered devices. Contact your admin.` };
        }
        await prisma.registeredDevice.create({
          data: {
            id: uuidv4(), employeeId, deviceFingerprint: ctx.deviceId,
            platform: ctx.platform || 'unknown', model: ctx.model || null,
            isActive: true, lastUsedAt: new Date(),
          },
        });
        deviceVerified = true;
      } else {
        // Checkout / no auto-register: device must already be bound
        return { ok: false, reason: 'DEVICE_NOT_BOUND', message: 'This device is not registered to you. Check in first.' };
      }
    }

    // ── STEP 2: Wi-Fi Validation (re-checked here in case the network changed) ──
    const wifi = this._checkWifi(office, ctx, employeeId);
    if (!wifi.ok) return { ok: false, reason: wifi.reason, message: wifi.message };
    wifiVerified = wifi.verified;

    return { ok: true, deviceVerified, wifiVerified };
  }

  // ── Status + penalty from the ORGANIZATION's configured grace/late/penalty ─────
  // Lateness is measured from the official OPEN TIME (today), so it's consistent no
  // matter when the session was actually created. The penalty clock effectively
  // starts at openTime + graceMinutes (e.g. open 07:00 + grace 50 → penalties at 07:50).
  //  ≤ graceMinutes after open      → PRESENT, no penalty
  //  ≤ lateAfterMinutes after open  → PRESENT, gracePenalty (₦ off salary)
  //  > lateAfterMinutes after open  → COMPLETELY_LATE, latePenalty (₦ off salary)
  _computeStatusAndPenalty(clockInTime, session) {
    const o = session.office ?? {};
    const hours = officeHoursFor(clockInTime, o);
    if (!hours?.openTime) {
      const minutes = (clockInTime.getTime() - session.startTime.getTime()) / 60000;
      if (minutes <= (o.graceMinutes ?? 30)) return { status: 'PRESENT', penalty: 0, minutesLate: Math.max(0, Math.floor(minutes)) };
      if (minutes <= (o.lateAfterMinutes ?? 90)) return { status: 'PRESENT', penalty: o.gracePenalty ?? 0, minutesLate: Math.floor(minutes) };
      return { status: 'COMPLETELY_LATE', penalty: o.completelyLatePenalty ?? o.latePenalty ?? 0, minutesLate: Math.floor(minutes) };
    }
    const configuredLateAfter = Number(o.lateAfterMinutes);
    const lateAfterMinutes = configuredLateAfter > 0 ? configuredLateAfter : Number(env.CHECKIN_WINDOW_MIN) || 40;
    const result = evaluateAttendance(clockInTime, {
      ...o,
      ...hours,
      lateAfterMinutes,
      openingReference: session.startTime,
    });
    return result.status === 'LATE' ? { ...result, status: 'COMPLETELY_LATE', penalty: o.completelyLatePenalty ?? o.latePenalty ?? 0 } : result;
  }

  _isAfterCheckInDeadline(value, session) {
    const office = session.office ?? {};
    const hours = officeHoursFor(value, office);
    if (!hours) return true;
    const opening = openingOccurrence(session.startTime, hours.openTime, office.timezone, hours.closeTime, session.startTime);
    const configuredLateAfter = Number(office.lateAfterMinutes);
    const lateAfter = configuredLateAfter > 0 ? configuredLateAfter : Number(env.CHECKIN_WINDOW_MIN) || 40;
    return opening && value >= new Date(opening.getTime() + Math.max(0, lateAfter) * 60_000);
  }

  _isBeforeOpening(value, session) {
    const office = session.office ?? {};
    const hours = officeHoursFor(value, office);
    if (!hours) return true;
    const opening = openingOccurrence(session.startTime, hours.openTime, office.timezone, hours.closeTime, session.startTime);
    return opening && value < opening;
  }

  async getStatus(employeeId, date) {
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      select: { id: true, organization: { select: { timezone: true } } },
    });
    if (!employee) return null;
    if (date) {
      const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date))
        ? new Date(`${date}T00:00:00.000Z`)
        : new Date(date);
      if (Number.isNaN(targetDate.getTime())) {
        throw Object.assign(new Error('Invalid attendance date.'), { status: 400 });
      }
      return prisma.attendanceRecord.findFirst({
        where: { employeeId, date: dateOnly(targetDate, employee.organization?.timezone || 'Africa/Lagos') },
        include: { breakRecords: true, session: { select: { office: { select: { timezone: true } } } } },
      });
    }

    const now = await getCurrentServerTime();
    const activeRecord = await prisma.attendanceRecord.findFirst({
      where: {
        employeeId,
        session: {
          startTime: { lte: now },
          OR: [{ endTime: null }, { endTime: { gt: now } }],
        },
      },
      include: {
        breakRecords: true,
        session: { select: { office: { select: { timezone: true } } } },
      },
      orderBy: { clockInTime: 'desc' },
    });
    if (activeRecord) return activeRecord;

    const recent = await prisma.attendanceRecord.findMany({
      where: { employeeId },
      include: {
        breakRecords: true,
        session: { select: { startTime: true, office: { select: { timezone: true, openTime: true, closeTime: true } } } },
      },
      orderBy: { clockInTime: 'desc' },
      take: 20,
    });
    return recent.find((record) => {
      const office = record.session?.office;
      if (!office) return false;
      const localWorkDate = attendanceDate(now, office);
      return record.date.getTime() === localWorkDate.getTime();
    }) ?? null;
  }

  async getHistory(employeeId, range) {
    const { startDate, endDate, page = 1, limit = 30 } = range;
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { employeeId, date: { gte: new Date(startDate), lte: new Date(endDate) } },
        include: {
          breakRecords: true,
          session: { select: { sessionName: true, office: { select: { name: true, timezone: true } } } },
          checkInRecorder: { select: { id: true, firstName: true, lastName: true, email: true } },
          checkOutRecorder: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { date: 'desc' },
        skip, take: limit,
      }),
      prisma.attendanceRecord.count({
        where: { employeeId, date: { gte: new Date(startDate), lte: new Date(endDate) } },
      }),
    ]);

    return { records, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async flagRecord(recordId, reason, adminId, orgId) {
    const record = await prisma.attendanceRecord.findFirst({
      where: { id: recordId, employee: { orgId } }, select: { id: true },
    });
    if (!record) throw Object.assign(new Error('Attendance record not found.'), { status: 404 });
    return prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { flagged: true, flagReason: reason, reviewedBy: adminId },
    });
  }

  async approveRecord(recordId, adminId, notes, orgId) {
    const record = await prisma.attendanceRecord.findFirst({
      where: { id: recordId, employee: { orgId } }, select: { id: true },
    });
    if (!record) throw Object.assign(new Error('Attendance record not found.'), { status: 404 });
    return prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { flagged: false, reviewedBy: adminId, reviewNotes: notes },
    });
  }

  _emit(event, payload) {
    if (!this._io) {
      try { this._io = require('../sockets/io').getIO(); } catch { return; }
    }
    if (this._io) this._io.emit(event, payload);
  }
}

module.exports = new AttendanceService();
