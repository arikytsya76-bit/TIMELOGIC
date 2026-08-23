const { prisma } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const EmergencyControlService = require('../services/EmergencyControlService');
const AttendanceService = require('../services/AttendanceService');
const EmployeePolicy = require('../services/EmployeePolicyService');

// ── Organization / Office / Department ────────────────────────────────────────

const getOrg = async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.user.orgId },
      include: {
        offices: { orderBy: { createdAt: 'asc' }, include: { securitySettings: true, _count: { select: { sessions: true } } } },
        departments: { include: { _count: { select: { employees: true } } } },
        _count: { select: { users: true } },
      },
    });
    res.json({ success: true, data: org });
  } catch (err) { next(err); }
};

const updateOrg = async (req, res, next) => {
  try {
    const { name, industry, subscriptionTier } = req.body;
    const org = await prisma.organization.update({
      where: { id: req.user.orgId },
      data: { name, industry, subscriptionTier },
    });
    res.json({ success: true, data: org });
  } catch (err) { next(err); }
};

const createOffice = async (req, res, next) => {
  try {
    const { name, address, timezone } = req.body;
    const office = await prisma.office.create({
      data: { id: uuidv4(), orgId: req.user.orgId, name, address, timezone },
    });
    await prisma.securitySettings.create({
      data: { id: uuidv4(), officeId: office.id, updatedBy: req.user.id },
    });
    res.status(201).json({ success: true, data: office });
  } catch (err) { next(err); }
};

const createDepartment = async (req, res, next) => {
  try {
    const { name, managerId } = req.body;
    if (managerId) {
      const manager = await prisma.user.findFirst({
        where: { id: managerId, orgId: req.user.orgId }, select: { id: true },
      });
      if (!manager) return res.status(400).json({ success: false, message: 'Manager does not belong to your organization.' });
    }
    const dept = await prisma.department.create({
      data: { id: uuidv4(), orgId: req.user.orgId, name, managerId },
    });
    res.status(201).json({ success: true, data: dept });
  } catch (err) { next(err); }
};

// ── Users ─────────────────────────────────────────────────────────────────────

const listUsers = async (req, res, next) => {
  try {
    const { role, status, departmentId, page = 1, limit = 20, search } = req.query;
    const skip = (+page - 1) * +limit;
    const where = {
      orgId: req.user.orgId,
      // Admins never see TERMINATED employees — only Super Admin can via /api/super routes
      status: { not: 'TERMINATED' },
      ...(role && { role }),
      ...(status && status !== 'TERMINATED' && { status }),
      ...(departmentId && { departmentId }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, firstName: true, lastName: true, email: true,
          role: true, status: true, shiftType: true,
          profileImageUrl: true, employeeCode: true,
          phone: true, checkInMethod: true,
          departmentId: true, createdAt: true, lastLoginAt: true,
          department: { select: { name: true } },
          _count: { select: { devices: true } },
        },
        orderBy: { firstName: 'asc' },
        skip,
        take: +limit,
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ success: true, data: users, total, page: +page, totalPages: Math.ceil(total / +limit) });
  } catch (err) { next(err); }
};

const updateUser = async (req, res, next) => {
  try {
    // Tenant isolation: the target must belong to the admin's own organization
    const target = await prisma.user.findUnique({
      where: { id: req.params.userId }, select: { orgId: true, role: true },
    });
    if (!target || target.orgId !== req.user.orgId) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (target.role !== 'EMPLOYEE') {
      return res.status(403).json({ success: false, message: 'Only employee accounts can be modified here.' });
    }

    const { firstName, lastName, status, departmentId, shiftType, checkInMethod, phone } = req.body;
    if (departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: departmentId, orgId: req.user.orgId }, select: { id: true },
      });
      if (!department) return res.status(400).json({ success: false, message: 'Department does not belong to your organization.' });
    }
    let allowedMethod;
    if (checkInMethod !== undefined) {
      const org = await EmployeePolicy.getOrganizationPolicy(req.user.orgId);
      allowedMethod = EmployeePolicy.assertMethodAllowed(org, checkInMethod);
      const openRecord = await prisma.attendanceRecord.findFirst({
        where: { employeeId: req.params.userId, clockOutTime: null },
        select: { checkInSource: true },
      });
      const nextCapabilities = EmployeePolicy.methodCapabilities(allowedMethod);
      if (
        (openRecord?.checkInSource === 'PHONE' && !nextCapabilities.phone) ||
        (openRecord?.checkInSource === 'MANUAL' && !nextCapabilities.manual)
      ) {
        return res.status(409).json({ success: false, message: 'Check this employee out before changing their check-in method.' });
      }
    }
    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: {
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(departmentId !== undefined ? { departmentId: departmentId || null } : {}),
        ...(shiftType !== undefined ? { shiftType } : {}),
        ...(allowedMethod !== undefined ? { checkInMethod: allowedMethod } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
      },
      select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, checkInMethod: true, phone: true },
    });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

const suspendUser = async (req, res, next) => {
  try {
    // Tenant isolation + never suspend a Super Admin
    const result = await prisma.user.updateMany({
      where: { id: req.params.userId, orgId: req.user.orgId, role: 'EMPLOYEE' },
      data: { status: 'SUSPENDED' },
    });
    if (result.count === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    await prisma.refreshToken.deleteMany({ where: { userId: req.params.userId } });
    res.json({ success: true, message: 'User suspended' });
  } catch (err) { next(err); }
};

// ── Security Settings ─────────────────────────────────────────────────────────

const getSecuritySettings = async (req, res, next) => {
  try {
    const settings = await prisma.securitySettings.findFirst({
      where: { officeId: req.params.officeId, office: { orgId: req.user.orgId } },
    });
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
};

const updateSecuritySettings = async (req, res, next) => {
  try {
    // Office-level field: Wi-Fi SSID lives on the Office model
    const { wifiSSID } = req.body;
    if (wifiSSID !== undefined) {
      await prisma.office.update({
        where: { id: req.params.officeId },
        data: { wifiSSID: (wifiSSID && wifiSSID.trim()) ? wifiSSID.trim() : null },
      });
    }

    // Everything else belongs to SecuritySettings — strip non-settings keys
    const {
      id, officeId, createdAt, updatedAt, updatedBy: _ub, wifiSSID: _w,
      ...settingsData
    } = req.body;

    const settings = await prisma.securitySettings.upsert({
      where:  { officeId: req.params.officeId },
      update: settingsData,
      create: { id: uuidv4(), officeId: req.params.officeId, ...settingsData },
    });

    const office = await prisma.office.findUnique({ where: { id: req.params.officeId } });
    res.json({ success: true, data: { settings, office } });
  } catch (err) { next(err); }
};

// ── Break Policy ──────────────────────────────────────────────────────────────

const setBreakPolicy = async (req, res, next) => {
  try {
    const { departmentId } = req.params;
    const department = await prisma.department.findFirst({
      where: { id: departmentId, orgId: req.user.orgId }, select: { id: true },
    });
    if (!department) return res.status(404).json({ success: false, message: 'Department not found.' });
    const policy = await prisma.breakPolicy.upsert({
      where: { departmentId },
      create: { id: uuidv4(), departmentId, ...req.body },
      update: req.body,
    });
    res.json({ success: true, data: policy });
  } catch (err) { next(err); }
};

// ── Emergency Controls ────────────────────────────────────────────────────────

// Resolve the correct officeId — admin may pass orgId accidentally; fall back to first office
async function resolveOfficeId(officeIdOrOrgId, orgId) {
  if (officeIdOrOrgId) {
    // Check if it's a valid officeId
    const asOffice = await prisma.office.findFirst({ where: { id: officeIdOrOrgId, orgId }, select: { id: true } });
    if (asOffice) return asOffice.id;
  }
  // Fall back to first active office for the admin's org
  const office = await prisma.office.findFirst({ where: { orgId, isActive: true }, select: { id: true } });
  return office?.id ?? null;
}

const emergencyStopAll = async (req, res, next) => {
  try {
    const { reason, officeId } = req.body;
    if (!reason?.trim()) return res.status(400).json({ success: false, message: 'Reason is required.' });
    const resolvedOfficeId = await resolveOfficeId(officeId, req.user.orgId);
    if (!resolvedOfficeId) return res.status(404).json({ success: false, message: 'No active office found for this organization.' });
    const control = await EmergencyControlService.stopAllAttendance(req.user.id, reason, resolvedOfficeId);
    res.json({ success: true, data: control });
  } catch (err) { next(err); }
};

const emergencyLockSystem = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ success: false, message: 'Reason is required.' });
    const control = await EmergencyControlService.lockSystem(req.user.id, reason, req.user.orgId);
    res.json({ success: true, data: control });
  } catch (err) { next(err); }
};

const emergencyInvalidateQR = async (req, res, next) => {
  try {
    const { reason, officeId } = req.body;
    if (!reason?.trim()) return res.status(400).json({ success: false, message: 'Reason is required.' });
    const resolvedOfficeId = await resolveOfficeId(officeId, req.user.orgId);
    if (!resolvedOfficeId) return res.status(404).json({ success: false, message: 'No active office found for this organization.' });
    const control = await EmergencyControlService.invalidateAllQR(req.user.id, reason, resolvedOfficeId);
    res.json({ success: true, data: control });
  } catch (err) { next(err); }
};

const emergencyRevert = async (req, res, next) => {
  try {
    const control = await EmergencyControlService.revert(req.user.id, req.params.controlId);
    res.json({ success: true, data: control });
  } catch (err) { next(err); }
};

const bcrypt = require('bcryptjs');
const env = require('../config/env');

const getNotifications = async (req, res, next) => {
  try {
    const orgUserIds = (await prisma.user.findMany({
      where: { orgId: req.user.orgId },
      select: { id: true },
    })).map((user) => user.id);
    const notifs = await prisma.notificationLog.findMany({
      where: { userId: { in: orgUserIds } },
      orderBy: { sentAt: 'desc' },
      take: 20,
    });
    res.json({ success: true, data: notifs });
  } catch (err) { next(err); }
};

// Subscription plan employee limits
const PLAN_LIMITS = { starter: 20, business: 60, enterprise: Infinity };
const PLAN_NAMES  = { starter: 'Starter', business: 'Business', enterprise: 'Enterprise' };

const createEmployee = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, employeeCode, departmentId, shiftType, phone, checkInMethod = 'PHONE' } = req.body;

    // ── Subscription enforcement ──────────────────────────────────────────────
    const org = await prisma.organization.findUnique({
      where: { id: req.user.orgId },
      select: {
        subscriptionTier: true, name: true,
        allowDeviceCheckIn: true, allowManualCheckIn: true,
      },
    });
    const allowedMethod = EmployeePolicy.assertMethodAllowed(org, checkInMethod);
    const tier   = (org?.subscriptionTier ?? 'starter').toLowerCase();
    const limit  = PLAN_LIMITS[tier] ?? 20;
    if (limit !== Infinity) {
      const count = await prisma.user.count({
        where: { orgId: req.user.orgId, role: 'EMPLOYEE', status: { not: 'TERMINATED' } },
      });
      if (count >= limit) {
        return res.status(403).json({
          success: false,
          message: `Employee limit reached for your ${PLAN_NAMES[tier] ?? 'current'} plan (max ${limit} employees). Please upgrade your subscription to add more employees.`,
          code: 'PLAN_LIMIT_REACHED',
          limit,
          current: count,
          plan: tier,
        });
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(400).json({ success: false, message: 'Email already in use.' });
    if (employeeCode) {
      const codeOwner = await prisma.user.findFirst({ where: { orgId: req.user.orgId, employeeCode } });
      if (codeOwner) return res.status(400).json({ success: false, message: 'Employee code already in use.' });
    }
    if (departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: departmentId, orgId: req.user.orgId }, select: { id: true },
      });
      if (!department) return res.status(400).json({ success: false, message: 'Department does not belong to your organization.' });
    }
    const passwordHash = await bcrypt.hash(password, +(env.BCRYPT_ROUNDS || 12));
    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        orgId: req.user.orgId,
        firstName, lastName,
        email: email.toLowerCase(),
        employeeCode: employeeCode || null,
        passwordHash,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        shiftType: shiftType || 'MORNING',
        departmentId: departmentId || null,
        phone: phone || null,
        checkInMethod: allowedMethod,
      },
      select: { id: true, firstName: true, lastName: true, email: true, employeeCode: true, role: true, status: true, shiftType: true, phone: true, checkInMethod: true },
    });
    // Initialize leave balances
    const types = ['ANNUAL','SICK','CASUAL','MATERNITY','PATERNITY','UNPAID','COMPASSIONATE'];
    const defaults = { ANNUAL:14, SICK:10, CASUAL:5, MATERNITY:90, PATERNITY:14, UNPAID:0, COMPASSIONATE:3 };
    const year = new Date().getFullYear();
    for (const lt of types) {
      await prisma.leaveBalance.create({ data: { id: uuidv4(), employeeId: user.id, leaveType: lt, year, totalEntitled: defaults[lt], remaining: defaults[lt] } });
    }
    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
};

const deleteEmployee = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { orgId: true, role: true, status: true } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role !== 'EMPLOYEE') return res.status(403).json({ success: false, message: 'Only employee accounts can be terminated here.' });
    if (user.orgId !== req.user.orgId) return res.status(403).json({ success: false, message: 'Access denied' });

    // SOFT DELETE — set status to TERMINATED (keeps all records for audit/history)
    // The login flow already blocks users whose status !== 'ACTIVE'
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'TERMINATED' },
    });

    // Revoke all refresh tokens so the employee is immediately signed out
    await prisma.refreshToken.deleteMany({ where: { userId } });

    res.json({
      success: true,
      message: 'Employee has been terminated. They can no longer log in. All records are preserved and visible to Super Admin.',
    });
  } catch (err) { next(err); }
};

// POST /api/admin/users/:userId/reset-device
// Frees an employee's device binding so they can sign in on a NEW phone. The
// first device used after this becomes their bound device; the old one is
// rejected (it no longer matches the active binding).
const resetDevice = async (req, res, next) => {
  try {
    const { userId } = req.params;
    // Tenant isolation: admins can only reset employees in their own org.
    const where = req.user.role === 'SUPER_ADMIN'
      ? { id: userId, role: 'EMPLOYEE' }
      : { id: userId, orgId: req.user.orgId, role: 'EMPLOYEE' };
    const emp = await prisma.user.findFirst({ where, select: { id: true } });
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

    const result = await prisma.registeredDevice.updateMany({
      where: { employeeId: userId, isActive: true },
      data: { isActive: false },
    });
    res.json({
      success: true,
      cleared: result.count,
      message: 'Device unlinked. The employee can now sign in on a new device, which becomes their bound device. The old device will no longer work.',
    });
  } catch (err) { next(err); }
};

const getManualAttendance = async (req, res, next) => {
  try {
    const data = await AttendanceService.getManualDashboard(req.user.orgId, req.query);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const manualCheckIn = async (req, res, next) => {
  try {
    const data = await AttendanceService.manualCheckIn(req.user.id, req.user.orgId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
};

const manualCheckOut = async (req, res, next) => {
  try {
    const data = await AttendanceService.manualCheckOut(req.user.id, req.user.orgId, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

module.exports = {
  getOrg, updateOrg,
  createOffice,
  createDepartment,
  listUsers, updateUser, suspendUser, deleteEmployee, resetDevice,
  getSecuritySettings, updateSecuritySettings,
  setBreakPolicy,
  emergencyStopAll, emergencyLockSystem, emergencyInvalidateQR, emergencyRevert,
  getNotifications, createEmployee,
  getManualAttendance, manualCheckIn, manualCheckOut,
};
