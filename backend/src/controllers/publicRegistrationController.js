const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../config/database');
const env = require('../config/env');
const upload = require('../middleware/upload');

const asNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clean = (value) => String(value ?? '').trim();

async function listOrganizations(req, res, next) {
  try {
    const organizations = await prisma.organization.findMany({
      where: { id: { not: 'platform-org' } },
      select: {
        id: true, name: true,
        departments: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: organizations.map((org) => ({
      id: org.id, name: org.name, departments: org.departments,
    })) });
  } catch (err) { next(err); }
}

async function createOrganization(req, res, next) {
  try {
    const payload = req.body || {};
    const name = clean(payload.name);
    const admin = payload.admin || {};
    if (!name || !clean(admin.firstName) || !clean(admin.lastName) || !clean(admin.email) || !clean(admin.password)) {
      return res.status(400).json({ success: false, message: 'Organization name and complete admin account details are required.' });
    }
    if (admin.password.length < 8) return res.status(400).json({ success: false, message: 'Admin password must be at least 8 characters.' });
    const duplicateOrg = await prisma.organization.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
    if (duplicateOrg) return res.status(409).json({ success: false, message: 'An organization with this name is already registered.' });
    const duplicateEmail = await prisma.user.findUnique({ where: { email: clean(admin.email).toLowerCase() }, select: { id: true } });
    if (duplicateEmail) return res.status(409).json({ success: false, message: 'That admin email is already registered.' });
    const offices = Array.isArray(payload.offices) ? payload.offices : [];
    const departments = Array.isArray(payload.departments) ? payload.departments : [];
    if (!offices.length) offices.push({ name: 'Main Office' });
    for (const office of offices) {
      const graceMinutes = asNumber(office.graceMinutes, 30);
      const lateAfterMinutes = asNumber(office.lateAfterMinutes, 90);
      if (lateAfterMinutes < 1 || lateAfterMinutes < graceMinutes) {
        return res.status(400).json({ success: false, message: 'Each office late-after value must be at least 1 minute and no less than its grace period.' });
      }
    }
    const passwordHash = await bcrypt.hash(admin.password, Number(env.BCRYPT_ROUNDS) || 12);
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: {
        id: uuidv4(), name, industry: clean(payload.industry) || 'General',
        subscriptionTier: clean(payload.subscriptionTier) || 'starter',
        allowDeviceCheckIn: payload.allowDeviceCheckIn !== false,
        allowManualCheckIn: Boolean(payload.allowManualCheckIn),
        hasStudents: Boolean(payload.hasStudents),
        openingTime: clean(payload.openingTime) || '08:00', timezone: clean(payload.timezone) || 'Africa/Lagos',
      } });
      const createdOffices = [];
      for (const office of offices) {
        const created = await tx.office.create({ data: {
          id: uuidv4(), orgId: org.id, name: clean(office.name) || 'Main Office', address: clean(office.address),
          timezone: clean(office.timezone) || org.timezone, wifiSSID: clean(office.wifiSSID) || null, publicIp: clean(office.publicIp) || null,
          openTime: clean(office.openTime) || org.openingTime, closeTime: clean(office.closeTime) || '17:00',
          breakMinutes: asNumber(office.breakMinutes, 60), graceMinutes: asNumber(office.graceMinutes, 30),
          lateAfterMinutes: asNumber(office.lateAfterMinutes, 90), gracePenalty: asNumber(office.gracePenalty, 0),
          latePenalty: asNumber(office.latePenalty, 0), autoSessionMinutes: asNumber(office.autoSessionMinutes, 60),
          breakStart: clean(office.breakStart) || null, breakEnd: clean(office.breakEnd) || null,
        } });
        createdOffices.push(created);
      }
      await tx.securitySettings.create({ data: { id: uuidv4(), officeId: createdOffices[0].id, qrRotationSeconds: 30 } });
      for (const department of departments) {
        const dept = await tx.department.create({ data: { id: uuidv4(), orgId: org.id, name: clean(department.name || department) || 'General' } });
        await tx.breakPolicy.create({ data: {
          id: uuidv4(), departmentId: dept.id, policyName: `${dept.name} Break Policy`, maxLunchMinutes: 60,
          maxShortBreaks: 2, maxShortBreakMinutes: 15, totalDailyBreakLimit: createdOffices[0].breakMinutes,
          breakStart: clean(department.breakStart) || null, breakEnd: clean(department.breakEnd) || null,
          appliesTo: ['MORNING', 'AFTERNOON', 'FLEXIBLE'],
        } });
      }
      const adminUser = await tx.user.create({ data: {
        id: uuidv4(), orgId: org.id, firstName: clean(admin.firstName), lastName: clean(admin.lastName),
        email: clean(admin.email).toLowerCase(),
        passwordHash, role: 'ADMIN', status: 'ACTIVE',
      }, select: { id: true, firstName: true, lastName: true, email: true, employeeCode: true } });
      return { org, offices: createdOffices, adminUser };
    });
    res.status(201).json({ success: true, data: { organization: { id: result.org.id, name: result.org.name }, admin: result.adminUser, message: 'Organization registered successfully.' } });
  } catch (err) { next(err); }
}

async function createEmployee(req, res, next) {
  try {
    const data = req.body || {};
    const orgIdentifier = clean(data.organizationId || data.organization || data.organizationName);
    const resolved = await prisma.organization.findFirst({
      where: { name: { equals: orgIdentifier, mode: 'insensitive' } },
    });
    if (!resolved || resolved.id === 'platform-org') return res.status(404).json({ success: false, message: 'Organization is not registered. Register the organization first.' });
    const email = clean(data.email).toLowerCase();
    const employeeCode = clean(data.employeeCode);
    if (!clean(data.firstName) || !clean(data.lastName) || !email || !clean(data.password)) return res.status(400).json({ success: false, message: 'First name, last name, email and password are required.' });
    if (data.password.length < 8) return res.status(400).json({ success: false, message: 'Employee password must be at least 8 characters.' });
    const duplicate = await prisma.user.findFirst({ where: { OR: [{ email }, ...(employeeCode ? [{ orgId: resolved.id, employeeCode }] : [])] }, select: { id: true, orgId: true } });
    if (duplicate) return res.status(409).json({ success: false, message: 'This employee email or identifier is already registered.' });
    const method = ['PHONE', 'MANUAL', 'BOTH'].includes(data.checkInMethod) ? data.checkInMethod : 'PHONE';
    if ((method === 'PHONE' || method === 'BOTH') && !resolved.allowDeviceCheckIn) return res.status(400).json({ success: false, message: 'Phone/device check-in is disabled for this organization.' });
    if ((method === 'MANUAL' || method === 'BOTH') && !resolved.allowManualCheckIn) return res.status(400).json({ success: false, message: 'Manual check-in is disabled for this organization.' });
    let departmentId = clean(data.departmentId) || null;
    if (departmentId) {
      const department = await prisma.department.findFirst({ where: { id: departmentId, orgId: resolved.id }, select: { id: true } });
      if (!department) return res.status(400).json({ success: false, message: 'Selected department does not belong to this organization.' });
    }
    const employee = await prisma.user.create({ data: {
      id: uuidv4(), orgId: resolved.id, firstName: clean(data.firstName), lastName: clean(data.lastName), email,
      employeeCode: employeeCode || null, passwordHash: await bcrypt.hash(data.password, Number(env.BCRYPT_ROUNDS) || 12),
      role: 'EMPLOYEE', status: 'ACTIVE', phone: clean(data.phone) || null, shiftType: clean(data.shiftType) || 'MORNING',
      checkInMethod: method,
      departmentId,
      profileImageUrl: req.file ? `/uploads/faces/${req.file.filename}` : null,
    }, select: { id: true, firstName: true, lastName: true, email: true, employeeCode: true, orgId: true, checkInMethod: true, profileImageUrl: true } });
    res.status(201).json({ success: true, data: { employee, message: 'Employee registered successfully.' } });
  } catch (err) { next(err); }
}

module.exports = { listOrganizations, createOrganization, createEmployee, uploadEmployeePhoto: upload.single('photo') };
