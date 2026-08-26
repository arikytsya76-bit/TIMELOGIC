const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../config/database');
const env = require('../config/env');
const logger = require('../config/logger');
const EmployeePolicy = require('../services/EmployeePolicyService');

// GET /api/super/organizations — all orgs with full detail
const listOrgs = async (req, res, next) => {
  try {
    const orgs = await prisma.organization.findMany({
      include: {
        _count: { select: { offices: true, departments: true, users: true, students: true } },
        offices: {
          select: {
            id: true, name: true, address: true, timezone: true, isActive: true,
            wifiSSID: true, publicIp: true, openTime: true, closeTime: true, weeklySchedule: true, breakMinutes: true,
            graceMinutes: true, lateAfterMinutes: true, gracePenalty: true, latePenalty: true,
            autoSessionMinutes: true, breakStart: true, breakEnd: true,
            securitySettings: { select: { id: true } },
            _count: { select: { sessions: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        departments: {
          select: {
            id: true, name: true,
            breakPolicy: true,
            manager: { select: { id: true, firstName: true, lastName: true } },
            _count: { select: { employees: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: orgs });
  } catch (err) { next(err); }
};

// POST /api/super/organizations — create org + offices + depts + admin
const createOrg = async (req, res, next) => {
  try {
    const {
      name, industry, subscriptionTier,
      allowDeviceCheckIn = true,
      allowManualCheckIn = false,
      hasStudents = false,
      openingTime = '08:00',
      timezone = 'Africa/Lagos',
      offices = [],       // [{ name, address, timezone }]
      departments = [],   // [{ name }]
      admin,              // { firstName, lastName, email, password, employeeCode? }
    } = req.body;

    if (!name || !admin?.email || !admin?.password) {
      return res.status(400).json({ success: false, message: 'Organization name, admin email and password are required.' });
    }

    if (!allowDeviceCheckIn && !allowManualCheckIn) {
      return res.status(400).json({ success: false, message: 'Enable phone/device check-in, manual check-in, or both.' });
    }

    // Check for duplicate email
    const existing = await prisma.user.findUnique({ where: { email: admin.email.toLowerCase() } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'An account with that email already exists.' });
    }

    const passwordHash = await bcrypt.hash(admin.password, +env.BCRYPT_ROUNDS || 12);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the organization
      const org = await tx.organization.create({
        data: {
          id: uuidv4(),
          name: String(name).trim(),
          industry: industry || 'General',
          subscriptionTier: subscriptionTier || 'starter',
          allowDeviceCheckIn: Boolean(allowDeviceCheckIn),
          allowManualCheckIn: Boolean(allowManualCheckIn),
          hasStudents: Boolean(hasStudents),
          openingTime,
          timezone,
        },
      });

      // 2. Create offices — each carries its own Wi-Fi + work hours + break allowance
      const createdOffices = await Promise.all(
        offices.map((o) =>
          tx.office.create({
            data: {
              id: uuidv4(),
              orgId: org.id,
              name: o.name || 'Main Office',
              address: o.address || '',
              timezone: o.timezone || timezone,
              // Each org sets its OWN Wi-Fi (Android SSID) + public IP (iOS/web network).
              wifiSSID: (o.wifiSSID && o.wifiSSID.trim()) ? o.wifiSSID.trim() : null,
              publicIp: (o.publicIp && o.publicIp.trim()) ? o.publicIp.trim() : null,
              openTime:  o.openTime  || openingTime,
              closeTime: o.closeTime || '17:00',
              breakMinutes: Number.isFinite(+o.breakMinutes) ? parseInt(o.breakMinutes, 10) : 60,
              graceMinutes:       Number.isFinite(+o.graceMinutes)       ? parseInt(o.graceMinutes, 10)       : 30,
              lateAfterMinutes:   Number.isFinite(+o.lateAfterMinutes)   ? parseInt(o.lateAfterMinutes, 10)   : 90,
              gracePenalty:       Number.isFinite(+o.gracePenalty)       ? parseInt(o.gracePenalty, 10)       : 0,
              latePenalty:        Number.isFinite(+o.latePenalty)        ? parseInt(o.latePenalty, 10)        : 0,
              autoSessionMinutes: Number.isFinite(+o.autoSessionMinutes) ? parseInt(o.autoSessionMinutes, 10) : 60,
              weeklySchedule: o.weeklySchedule || null,
              breakStart: o.breakStart || null,
              breakEnd:   o.breakEnd   || null,
            },
          })
        )
      );

      // Ensure at least one office
      const defaultOffice = createdOffices[0] ?? await tx.office.create({
        data: { id: uuidv4(), orgId: org.id, name: 'Main Office', address: '', timezone, wifiSSID: null, openTime: openingTime, closeTime: '17:00', breakMinutes: 60 },
      });

      // 3. Default security settings for the first office
      await tx.securitySettings.create({
        data: {
          id: uuidv4(),
          officeId: defaultOffice.id,
          qrRotationSeconds: 30,
        },
      });

      // 4. Create departments
      const createdDepts = await Promise.all(
        departments.map((d) =>
          tx.department.create({
            data: { id: uuidv4(), orgId: org.id, name: d.name || d },
          })
        )
      );

      // 5. Create admin user
      const adminUser = await tx.user.create({
        data: {
          id: uuidv4(),
          orgId: org.id,
          firstName: admin.firstName || 'Admin',
          lastName: admin.lastName || 'User',
          email: admin.email.toLowerCase(),
          passwordHash,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
      });

      // 6. Break policy for each department (each carries its OWN break window)
      for (let i = 0; i < createdDepts.length; i++) {
        const dept = createdDepts[i];
        const src  = departments[i] || {};
        await tx.breakPolicy.create({
          data: {
            id: uuidv4(),
            departmentId: dept.id,
            policyName: `${dept.name} Break Policy`,
            maxLunchMinutes: 60,
            maxShortBreaks: 2,
            maxShortBreakMinutes: 15,
            totalDailyBreakLimit: defaultOffice.breakMinutes ?? 90,
            breakStart: (src.breakStart && src.breakStart.trim()) ? src.breakStart.trim() : null,
            breakEnd:   (src.breakEnd && src.breakEnd.trim())   ? src.breakEnd.trim()   : null,
            appliesTo: ['MORNING', 'AFTERNOON', 'FLEXIBLE'],
          },
        });
      }

      return { org, offices: createdOffices.length > 0 ? createdOffices : [defaultOffice], departments: createdDepts, adminUser };
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
};

// PUT /api/super/organizations/:id — edit org + its offices (name, plan, wifi, work hours, breaks)
const updateOrg = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name, industry, subscriptionTier, offices = [],
      allowDeviceCheckIn, allowManualCheckIn, hasStudents, openingTime, timezone,
    } = req.body;

    const current = await prisma.organization.findUnique({
      where: { id },
      select: { allowDeviceCheckIn: true, allowManualCheckIn: true, hasStudents: true },
    });
    if (!current) return res.status(404).json({ success: false, message: 'Organization not found.' });
    const nextDevice = allowDeviceCheckIn ?? current.allowDeviceCheckIn;
    const nextManual = allowManualCheckIn ?? current.allowManualCheckIn;
    if (!nextDevice && !nextManual) {
      return res.status(400).json({ success: false, message: 'Enable phone/device check-in, manual check-in, or both.' });
    }
    if (current.allowDeviceCheckIn && !nextDevice) {
      const openPhone = await prisma.attendanceRecord.findFirst({
        where: { employee: { orgId: id }, clockOutTime: null, checkInSource: 'PHONE' }, select: { id: true },
      });
      if (openPhone) return res.status(409).json({ success: false, message: 'Phone/device check-in cannot be disabled while an employee checked in by phone is still clocked in.' });
    }
    if (current.allowManualCheckIn && !nextManual) {
      const openManual = await prisma.attendanceRecord.findFirst({
        where: { employee: { orgId: id }, clockOutTime: null, checkInSource: 'MANUAL' }, select: { id: true },
      });
      if (openManual) return res.status(409).json({ success: false, message: 'Manual check-in cannot be disabled while a manually checked-in employee is still clocked in.' });
    }
    if (current.hasStudents && hasStudents === false) {
      const openStudent = await prisma.studentAttendance.findFirst({
        where: { student: { orgId: id }, checkOutTime: null }, select: { id: true },
      });
      if (openStudent) {
        return res.status(409).json({
          success: false,
          message: 'Student attendance cannot be disabled while a student is still checked in.',
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update org-level fields
      const org = await tx.organization.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(industry !== undefined ? { industry } : {}),
          ...(subscriptionTier !== undefined ? { subscriptionTier } : {}),
          ...(allowDeviceCheckIn !== undefined ? { allowDeviceCheckIn } : {}),
          ...(allowManualCheckIn !== undefined ? { allowManualCheckIn } : {}),
          ...(hasStudents !== undefined ? { hasStudents } : {}),
          ...(openingTime !== undefined ? { openingTime } : {}),
          ...(timezone !== undefined ? { timezone } : {}),
        },
      });

      // Keep every employee usable when a Super Admin turns one channel off.
      if (!nextDevice && nextManual) {
        await tx.user.updateMany({
          where: { orgId: id, role: 'EMPLOYEE', checkInMethod: { in: ['PHONE', 'BOTH'] } },
          data: { checkInMethod: 'MANUAL' },
        });
      } else if (nextDevice && !nextManual) {
        await tx.user.updateMany({
          where: { orgId: id, role: 'EMPLOYEE', checkInMethod: { in: ['MANUAL', 'BOTH'] } },
          data: { checkInMethod: 'PHONE' },
        });
      }

      // Update each office by id
      for (const o of offices) {
        if (!o.id) continue;
        const data = {};
        if (o.name      !== undefined) data.name      = o.name;
        if (o.address   !== undefined) data.address   = o.address;
        if (o.timezone  !== undefined) data.timezone  = o.timezone;
        if (o.wifiSSID  !== undefined) data.wifiSSID  = (o.wifiSSID && o.wifiSSID.trim()) ? o.wifiSSID.trim() : null;
        if (o.publicIp  !== undefined) data.publicIp  = (o.publicIp && o.publicIp.trim()) ? o.publicIp.trim() : null;
        if (o.openTime  !== undefined) data.openTime  = o.openTime || '08:00';
        if (o.closeTime !== undefined) data.closeTime = o.closeTime || '17:00';
        if (o.weeklySchedule !== undefined) data.weeklySchedule = o.weeklySchedule || null;
        if (o.breakMinutes !== undefined) data.breakMinutes = Number.isFinite(+o.breakMinutes) ? parseInt(o.breakMinutes, 10) : 60;
        if (o.graceMinutes !== undefined)       data.graceMinutes       = parseInt(o.graceMinutes, 10) || 0;
        if (o.lateAfterMinutes !== undefined)   data.lateAfterMinutes   = parseInt(o.lateAfterMinutes, 10) || 0;
        if (o.gracePenalty !== undefined)       data.gracePenalty       = parseInt(o.gracePenalty, 10) || 0;
        if (o.latePenalty !== undefined)        data.latePenalty        = parseInt(o.latePenalty, 10) || 0;
        if (o.autoSessionMinutes !== undefined) data.autoSessionMinutes = parseInt(o.autoSessionMinutes, 10) || 60;
        if (o.breakStart !== undefined) data.breakStart = o.breakStart || null;
        if (o.breakEnd   !== undefined) data.breakEnd   = o.breakEnd   || null;
        const ownedOffice = await tx.office.findFirst({ where: { id: o.id, orgId: id }, select: { id: true } });
        if (!ownedOffice) {
          throw Object.assign(new Error('One of the supplied offices does not belong to this organization.'), { status: 400 });
        }
        await tx.office.update({ where: { id: ownedOffice.id }, data });

        // Keep department break limits in sync with the office break allowance
        if (o.breakMinutes !== undefined) {
          await tx.breakPolicy.updateMany({
            where: { department: { orgId: id } },
            data: { totalDailyBreakLimit: data.breakMinutes },
          });
        }
      }

      return org;
    });

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// DELETE /api/super/organizations/:id
const deleteOrg = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Safety: never delete an org that has a SUPER_ADMIN or the platform org
    if (id === 'platform-org') {
      return res.status(403).json({ success: false, message: 'Cannot delete the platform organization.' });
    }
    const hasSuperAdmin = await prisma.user.findFirst({
      where: { orgId: id, role: 'SUPER_ADMIN' },
      select: { id: true },
    });
    if (hasSuperAdmin) {
      return res.status(403).json({ success: false, message: 'Cannot delete an organization that contains a Super Admin account.' });
    }

    const orgUserIds = (await prisma.user.findMany({
      where: { orgId: id },
      select: { id: true },
    })).map((user) => user.id);
    await prisma.notificationLog.deleteMany({ where: { userId: { in: orgUserIds } } });
    await prisma.organization.delete({ where: { id } });
    res.json({ success: true, message: 'Organization and all related data removed.' });
  } catch (err) { next(err); }
};

// GET /api/super/organizations/:id/users — ALL users including TERMINATED (soft-deleted)
const orgUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { orgId: req.params.id },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        role: true, status: true, employeeCode: true, shiftType: true,
        profileImageUrl: true, lastLoginAt: true, createdAt: true,
        department: { select: { name: true } },
        _count: { select: { devices: true, attendanceRecords: true } },
      },
      // Show active users first, terminated at bottom
      orderBy: [{ status: 'asc' }, { role: 'asc' }, { firstName: 'asc' }],
    });
    // Mark terminated employees clearly for the UI
    const enriched = users.map((u) => ({
      ...u,
      isTerminated: u.status === 'TERMINATED',
      orgName: undefined,
    }));
    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
};

// PUT /api/super/users/:userId/name — rename an organization ADMIN only.
const renameAdmin = async (req, res, next) => {
  try {
    const firstName = String(req.body?.firstName ?? '').trim();
    const lastName = String(req.body?.lastName ?? '').trim();
    if (!firstName || !lastName) return res.status(400).json({ success: false, message: 'First and last name are required.' });
    const admin = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true, role: true } });
    if (!admin) return res.status(404).json({ success: false, message: 'User not found.' });
    if (admin.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Only organization admins can be renamed.' });
    const user = await prisma.user.update({ where: { id: admin.id }, data: { firstName, lastName }, select: { id: true, firstName: true, lastName: true, email: true, role: true, orgId: true } });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

// GET /api/super/stats — system-wide stats
const systemStats = async (req, res, next) => {
  try {
    const [totalOrgs, totalAdmins, totalUsers, openAlerts] = await Promise.all([
      prisma.organization.count(),
      prisma.user.count({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } }),
      prisma.user.count({ where: { role: 'EMPLOYEE' } }),
      prisma.fraudAlert.count({ where: { status: 'NEW' } }),
    ]);
    res.json({ success: true, data: { totalOrgs, totalAdmins, totalUsers, openAlerts } });
  } catch (err) { next(err); }
};

// GET /api/super/notifications — recent system notifications
const getNotifications = async (req, res, next) => {
  try {
    const notifs = await prisma.notificationLog.findMany({
      orderBy: { sentAt: 'desc' },
      take: 20,
    });
    res.json({ success: true, data: notifs });
  } catch (err) { next(err); }
};

// GET /api/super/offices/:officeId/security — full office security details
const officeSecurityDetail = async (req, res, next) => {
  try {
    const { officeId } = req.params;
    const [office, settings, adminCount, employeeCount, activeSessions] = await Promise.all([
      prisma.office.findUnique({
        where: { id: officeId },
        include: {
          organization: { select: { id: true, name: true, industry: true, subscriptionTier: true } },
          _count: { select: { sessions: true } },
        },
      }),
      prisma.securitySettings.findUnique({ where: { officeId } }),
      prisma.user.count({ where: { organization: { offices: { some: { id: officeId } } }, role: 'ADMIN' } }),
      prisma.user.count({ where: { organization: { offices: { some: { id: officeId } } }, role: 'EMPLOYEE' } }),
      prisma.attendanceSession.count({ where: { officeId, status: 'ACTIVE' } }),
    ]);
    if (!office) return res.status(404).json({ success: false, message: 'Office not found' });
    res.json({ success: true, data: { office, settings: settings ?? {}, adminCount, employeeCount, activeSessions } });
  } catch (err) { next(err); }
};

// PUT /api/super/offices/:officeId/settings — SUPER ADMIN ONLY: edit Wi-Fi + security toggles
const updateOfficeSecurity = async (req, res, next) => {
  try {
    const { officeId } = req.params;
    // Office-level fields
    const b = req.body;
    const officeData = {};
    if (b.wifiSSID  !== undefined) officeData.wifiSSID  = (b.wifiSSID && b.wifiSSID.trim()) ? b.wifiSSID.trim() : null;
    if (b.publicIp  !== undefined) officeData.publicIp  = (b.publicIp && b.publicIp.trim()) ? b.publicIp.trim() : null;
    if (b.openTime  !== undefined) officeData.openTime  = b.openTime || '08:00';
    if (b.closeTime !== undefined) officeData.closeTime = b.closeTime || '17:00';
    if (b.breakMinutes !== undefined) officeData.breakMinutes = Number.isFinite(+b.breakMinutes) ? parseInt(b.breakMinutes, 10) : 60;
    if (b.graceMinutes !== undefined)       officeData.graceMinutes       = parseInt(b.graceMinutes, 10) || 0;
    if (b.lateAfterMinutes !== undefined)   officeData.lateAfterMinutes   = parseInt(b.lateAfterMinutes, 10) || 0;
    if (b.gracePenalty !== undefined)       officeData.gracePenalty       = parseInt(b.gracePenalty, 10) || 0;
    if (b.latePenalty !== undefined)        officeData.latePenalty        = parseInt(b.latePenalty, 10) || 0;
    if (b.autoSessionMinutes !== undefined) officeData.autoSessionMinutes = parseInt(b.autoSessionMinutes, 10) || 60;
    if (b.breakStart !== undefined) officeData.breakStart = b.breakStart || null;
    if (b.breakEnd   !== undefined) officeData.breakEnd   = b.breakEnd   || null;
    if (Object.keys(officeData).length) {
      await prisma.office.update({ where: { id: officeId }, data: officeData });
    }

    // SecuritySettings fields (strip non-column keys)
    const {
      id, officeId: _o, createdAt, updatedAt, updatedBy: _u,
      wifiSSID: _w, publicIp: _pi, openTime: _ot, closeTime: _ct, breakMinutes: _bm,
      graceMinutes: _g, lateAfterMinutes: _la, gracePenalty: _gp, latePenalty: _lp,
      autoSessionMinutes: _as, breakStart: _bs, breakEnd: _be,
      ...settingsData
    } = req.body;
    const settings = await prisma.securitySettings.upsert({
      where:  { officeId },
      update: settingsData,
      create: { id: uuidv4(), officeId, ...settingsData },
    });

    const office = await prisma.office.findUnique({ where: { id: officeId } });
    res.json({ success: true, data: { settings, office } });
  } catch (err) { next(err); }
};

// POST /api/super/reset — wipe ALL data, keep only Super Admin account(s) + platform org
const resetSystem = async (req, res, next) => {
  try {
    if (req.body?.confirm !== 'RESET') {
      return res.status(400).json({ success: false, message: 'Confirmation required. Type RESET to confirm.' });
    }

    const saIds = (await prisma.user.findMany({ where: { role: 'SUPER_ADMIN' }, select: { id: true } })).map((u) => u.id);

    // Delete in FK-safe order — most dependent first. Each step is best-effort.
    const steps = [
      ['notificationLog',         () => prisma.notificationLog.deleteMany()],
      ['attendanceReport',        () => prisma.attendanceReport.deleteMany()],
      ['emergencyControlSession', () => prisma.emergencyControlSession.deleteMany()],
      ['emergencyControl',        () => prisma.emergencyControl.deleteMany()],
      ['fraudAlert',              () => prisma.fraudAlert.deleteMany()],
      ['screenshotLog',           () => prisma.screenshotLog.deleteMany()],
      ['scanAttempt',             () => prisma.scanAttempt.deleteMany()],
      ['breakRecord',             () => prisma.breakRecord.deleteMany()],
      ['attendanceRecord',        () => prisma.attendanceRecord.deleteMany()],
      ['studentAttendance',       () => prisma.studentAttendance.deleteMany()],
      ['student',                 () => prisma.student.deleteMany()],
      ['qRToken',                 () => prisma.qRToken.deleteMany()],
      ['attendanceSession',       () => prisma.attendanceSession.deleteMany()],
      ['leaveRequest',            () => prisma.leaveRequest.deleteMany()],
      ['leaveBalance',            () => prisma.leaveBalance.deleteMany()],
      ['registeredDevice',        () => prisma.registeredDevice.deleteMany()],
      ['adminLoginEvent',         () => prisma.adminLoginEvent.deleteMany()],
      ['adminPermission',         () => prisma.adminPermission.deleteMany()],
      ['refreshToken (non-SA)',   () => prisma.refreshToken.deleteMany({ where: { userId: { notIn: saIds } } })],
      ['breakPolicy',             () => prisma.breakPolicy.deleteMany()],
      ['securitySettings',        () => prisma.securitySettings.deleteMany()],
      ['wiFiFingerprint',         () => prisma.wiFiFingerprint.deleteMany()],
      ['users (non-SA)',          () => prisma.user.deleteMany({ where: { role: { not: 'SUPER_ADMIN' } } })],
      ['department',              () => prisma.department.deleteMany()],
      ['office',                  () => prisma.office.deleteMany()],
      ['organization (non-platform)', () => prisma.organization.deleteMany({ where: { id: { not: 'platform-org' } } })],
    ];

    for (const [name, fn] of steps) {
      try { await fn(); }
      catch (e) { logger.warn(`Reset step "${name}" skipped: ${e.message}`); }
    }

    logger.info(`SYSTEM RESET performed by ${req.user.id} — all data cleared except Super Admin`);
    res.json({ success: true, message: 'System reset complete. Only the Super Admin account remains.' });
  } catch (err) { next(err); }
};

// PUT /api/super/profile — Super Admin updates their own name/email
const updateProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, email } = req.body;
    const data = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName  !== undefined) data.lastName  = lastName;
    if (email     !== undefined) data.email     = String(email).toLowerCase();
    const user = await prisma.user.update({
      where: { id: req.user.id }, data,
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'That email is already in use.' });
    next(err);
  }
};

// PUT /api/super/users/:userId/suspend — Super Admin may suspend ADMINS only
const suspendAdmin = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { role: true } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'SUPER_ADMIN') return res.status(403).json({ success: false, message: 'Cannot suspend a Super Admin.' });
    if (user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Only admins can be suspended. Employees are managed by their own admin.' });

    await prisma.user.update({ where: { id: req.params.userId }, data: { status: 'SUSPENDED' } });
    await prisma.refreshToken.deleteMany({ where: { userId: req.params.userId } });
    res.json({ success: true, message: 'Admin suspended' });
  } catch (err) { next(err); }
};

// PUT /api/super/users/:userId/activate — re-enable a suspended ADMIN
const activateAdmin = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { role: true } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Only admins can be activated here.' });
    await prisma.user.update({ where: { id: req.params.userId }, data: { status: 'ACTIVE' } });
    res.json({ success: true, message: 'Admin activated' });
  } catch (err) { next(err); }
};

// PUT /api/super/users/:userId/reassign — move an EMPLOYEE to another organization
const reassignEmployee = async (req, res, next) => {
  try {
    const { orgId } = req.body;
    if (!orgId) return res.status(400).json({ success: false, message: 'Target organization is required.' });

    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { role: true, orgId: true },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role !== 'EMPLOYEE') return res.status(403).json({ success: false, message: 'Only employees can be reassigned. Admins cannot be reassigned.' });

    const targetOrg = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });
    if (!targetOrg || targetOrg.id === 'platform-org') return res.status(400).json({ success: false, message: 'Invalid target organization.' });
    if (orgId === user.orgId) return res.status(400).json({ success: false, message: 'Employee already belongs to that organization.' });
    // User-linked attendance, leave, device, fraud, and payroll history is
    // tenant-owned. Moving a mutable user row would make that old history appear
    // inside the target organization. Reassignment is therefore deliberately
    // disabled until records carry immutable organization snapshots.
    return res.status(409).json({
      success: false,
      message: `Employee accounts cannot be moved between organizations because their audit history belongs to the original organization. Create a new employee account in ${targetOrg.name}.`,
    });
  } catch (err) { next(err); }
};

// GET /api/super/reports — system-wide report summary
const systemReport = async (req, res, next) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [totalOrgs, totalEmployees, totalAdmins, presentToday, lateToday, openAlerts, pendingLeaves, recentAttendance] = await Promise.all([
      prisma.organization.count(),
      prisma.user.count({ where: { role: 'EMPLOYEE', status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } }),
      prisma.attendanceRecord.count({ where: { date: { gte: new Date(now.setHours(0,0,0,0)) }, status: 'PRESENT', employee: { role: 'EMPLOYEE' } } }),
      prisma.attendanceRecord.count({ where: { date: { gte: new Date(now.setHours(0,0,0,0)) }, status: 'LATE', employee: { role: 'EMPLOYEE' } } }),
      prisma.fraudAlert.count({ where: { status: 'NEW' } }),
      prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      prisma.attendanceRecord.findMany({
        where: { clockInTime: { not: null }, employee: { role: 'EMPLOYEE' } },
        include: { employee: { select: { firstName: true, lastName: true } }, session: { select: { sessionName: true } } },
        orderBy: { clockInTime: 'desc' }, take: 10,
      }),
    ]);
    res.json({ success: true, data: { totalOrgs, totalEmployees, totalAdmins, presentToday, lateToday, openAlerts, pendingLeaves, recentAttendance, period: now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) } });
  } catch (err) { next(err); }
};

// POST /api/super/organizations/:orgId/departments — add a new department to an org
const addDepartment = async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const { name, breakStart = null, breakEnd = null, totalDailyBreakLimit = 90, maxShortBreaks = 2, maxShortBreakMinutes = 15, maxLunchMinutes = 60, overstayPenalty = 50 } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Department name is required.' });

    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true } });
    if (!org) return res.status(404).json({ success: false, message: 'Organization not found.' });

    // Check for duplicate department name in same org
    const existing = await prisma.department.findFirst({
      where: { orgId, name: { equals: name.trim(), mode: 'insensitive' } },
    });
    if (existing) return res.status(400).json({ success: false, message: `Department "${name.trim()}" already exists in ${org.name}.` });

    const dept = await prisma.department.create({
      data: { id: uuidv4(), orgId, name: name.trim() },
    });

    // Create a default break policy for this new department
    await prisma.breakPolicy.create({
      data: {
        id: uuidv4(),
        departmentId: dept.id,
        policyName: `${dept.name} Break Policy`,
        maxLunchMinutes: 60,
        maxShortBreaks: 2,
        maxShortBreakMinutes: 15,
        totalDailyBreakLimit: Number(totalDailyBreakLimit) || 90,
        maxShortBreaks: Number(maxShortBreaks) || 2,
        maxShortBreakMinutes: Number(maxShortBreakMinutes) || 15,
        maxLunchMinutes: Number(maxLunchMinutes) || 60,
        overstayPenalty: Number(overstayPenalty) || 50,
        breakStart, breakEnd,
        appliesTo: ['MORNING', 'AFTERNOON', 'FLEXIBLE'],
      },
    }).catch(() => {}); // non-critical

    res.status(201).json({ success: true, data: { ...dept, orgName: org.name } });
  } catch (err) { next(err); }
};

const getDepartmentBreakPolicy = async (req, res, next) => {
  try {
    const department = await prisma.department.findUnique({ where: { id: req.params.departmentId }, include: { breakPolicy: true, organization: { select: { id: true } } } });
    if (!department) return res.status(404).json({ success: false, message: 'Department not found.' });
    res.json({ success: true, data: department.breakPolicy ?? {} });
  } catch (err) { next(err); }
};

const updateDepartmentBreakPolicy = async (req, res, next) => {
  try {
    const { departmentId } = req.params;
    const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true, breakPolicy: true } });
    if (!department) return res.status(404).json({ success: false, message: 'Department not found.' });
    const allowed = ['policyName', 'maxLunchMinutes', 'maxShortBreaks', 'maxShortBreakMinutes', 'totalDailyBreakLimit', 'autoEndAfterMinutes', 'overstayPenalty', 'breakStart', 'breakEnd', 'requiresApproval', 'appliesTo'];
    const data = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
    for (const key of ['maxLunchMinutes', 'maxShortBreaks', 'maxShortBreakMinutes', 'totalDailyBreakLimit', 'autoEndAfterMinutes', 'overstayPenalty']) {
      if (data[key] !== undefined) data[key] = Number(data[key]);
    }
    const nextBreakStart = data.breakStart ?? department.breakPolicy?.breakStart;
    const nextBreakEnd = data.breakEnd ?? department.breakPolicy?.breakEnd;
    if (nextBreakStart && nextBreakEnd && nextBreakStart > nextBreakEnd) {
      return res.status(400).json({ success: false, message: 'Break end time must be at or after break start time.' });
    }
    const policy = await prisma.breakPolicy.upsert({ where: { departmentId }, update: data, create: { id: uuidv4(), departmentId, policyName: data.policyName || 'Department Break Policy', ...data } });
    res.json({ success: true, data: policy });
  } catch (err) { next(err); }
};

// PUT /api/super/employees/:userId/reemploy — re-activate a terminated employee
const reemployEmployee = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, firstName: true, lastName: true, email: true, orgId: true },
    });
    if (!user) return res.status(404).json({ success: false, message: 'Employee not found.' });
    if (user.status !== 'TERMINATED') {
      return res.status(400).json({ success: false, message: `Employee is not terminated (current status: ${user.status}).` });
    }

    // Set back to ACTIVE — all historical data was preserved during soft-delete
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE' },
    });

    logger.info(`Super Admin re-employed ${user.firstName} ${user.lastName} (${user.email})`);

    res.json({
      success: true,
      message: `${user.firstName} ${user.lastName} has been re-employed successfully. They can now log in with their existing credentials.`,
    });
  } catch (err) { next(err); }
};

// GET /api/super/employees/:userId/records — full profile + all records for any employee (including terminated)
const employeeFullRecord = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const [user, attendanceRecords, leaveRequests, breakRecords, fraudAlerts, leaveBalances] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: {
          department: { select: { name: true } },
          organization: { select: { id: true, name: true, industry: true } },
          _count: { select: { devices: true, attendanceRecords: true } },
        },
      }),
      prisma.attendanceRecord.findMany({
        where: { employeeId: userId },
        include: { session: { select: { sessionName: true, startTime: true } } },
        orderBy: { date: 'desc' },
        take: 100,
      }),
      prisma.leaveRequest.findMany({
        where: { employeeId: userId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.breakRecord.findMany({
        where: { employeeId: userId },
        orderBy: { startTime: 'desc' },
        take: 50,
      }),
      prisma.fraudAlert.findMany({
        where: { employeeId: userId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.leaveBalance.findMany({
        where: { employeeId: userId },
        orderBy: { leaveType: 'asc' },
      }),
    ]);

    if (!user) return res.status(404).json({ success: false, message: 'Employee not found.' });

    res.json({ success: true, data: { user, attendanceRecords, leaveRequests, breakRecords, fraudAlerts, leaveBalances } });
  } catch (err) { next(err); }
};

const LEAVE_TYPES = ['ANNUAL', 'SICK', 'CASUAL', 'MATERNITY', 'PATERNITY', 'UNPAID', 'COMPASSIONATE'];
const DEFAULT_LEAVE_DAYS = { ANNUAL: 14, SICK: 10, CASUAL: 5, MATERNITY: 90, PATERNITY: 14, UNPAID: 0, COMPASSIONATE: 3 };

// GET /super/organizations/:id/leave-policy — current days/year per leave type
const getLeavePolicy = async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id }, select: { leavePolicy: true, name: true },
    });
    if (!org) return res.status(404).json({ success: false, message: 'Organization not found.' });
    const saved = (org.leavePolicy && typeof org.leavePolicy === 'object') ? org.leavePolicy : {};
    const policy = {};
    for (const lt of LEAVE_TYPES) policy[lt] = (typeof saved[lt] === 'number') ? saved[lt] : DEFAULT_LEAVE_DAYS[lt];
    res.json({ success: true, data: { organization: org.name, policy } });
  } catch (err) { next(err); }
};

// PUT /super/organizations/:id/leave-policy — set days/year per leave type, then
// re-apply to every employee's balance for the current year.
const setLeavePolicy = async (req, res, next) => {
  try {
    const incoming = req.body?.policy ?? req.body ?? {};
    const policy = {};
    for (const lt of LEAVE_TYPES) {
      const v = Number(incoming[lt]);
      policy[lt] = Number.isFinite(v) && v >= 0 ? v : DEFAULT_LEAVE_DAYS[lt];
    }
    const org = await prisma.organization.update({
      where: { id: req.params.id }, data: { leavePolicy: policy }, select: { id: true },
    }).catch(() => null);
    if (!org) return res.status(404).json({ success: false, message: 'Organization not found.' });

    await require('../services/LeaveService').applyPolicyToOrg(org.id, new Date().getFullYear());
    res.json({ success: true, data: { policy } });
  } catch (err) { next(err); }
};

module.exports = { listOrgs, createOrg, updateOrg, deleteOrg, orgUsers, renameAdmin, systemStats, getNotifications, officeSecurityDetail, updateOfficeSecurity, systemReport, addDepartment, getDepartmentBreakPolicy, updateDepartmentBreakPolicy, employeeFullRecord, reemployEmployee, suspendAdmin, activateAdmin, reassignEmployee, updateProfile, resetSystem, getLeavePolicy, setLeavePolicy };
