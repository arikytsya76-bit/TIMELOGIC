/* eslint-disable no-console */
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const env = require('../src/config/env');
const { prisma } = require('../src/config/database');
const { redis } = require('../src/config/redis');
const AttendanceService = require('../src/services/AttendanceService');
const { attendanceDate, evaluateAttendance } = require('../src/utils/attendanceClock');

const apiUrl = new URL(process.env.LOCAL_API_URL || `http://127.0.0.1:${env.PORT || 5000}/api`);
if (!['localhost', '127.0.0.1', '::1'].includes(apiUrl.hostname)) {
  throw new Error('LOCAL_API_URL must point to this computer. Refusing to run verification against a hosted API.');
}

const runId = `${Date.now()}-${uuidv4().slice(0, 8)}`;
const password = 'LocalVerify@1234';
const state = {
  superAdminId: null,
  orgId: null,
  sessionId: null,
};

function step(message) {
  console.log(`  OK  ${message}`);
}

async function request(path, { method = 'GET', token, body, expected = [200], attempt = 0 } = {}) {
  const response = await fetch(new URL(path.replace(/^\//, ''), `${apiUrl.toString().replace(/\/$/, '')}/`), {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw;
  }
  if (response.status === 500 && payload?.code === 'P2028' && attempt < 2) {
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    return request(path, { method, token, body, expected, attempt: attempt + 1 });
  }
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path} returned ${response.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  }
  return { status: response.status, payload };
}

async function cleanup() {
  if (state.sessionId) {
    await prisma.attendanceSession.deleteMany({ where: { id: state.sessionId } }).catch(() => {});
  }
  if (state.orgId) {
    const userIds = (await prisma.user.findMany({
      where: { orgId: state.orgId },
      select: { id: true },
    }).catch(() => [])).map((user) => user.id);
    if (userIds.length) {
      await prisma.notificationLog.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    }
    await prisma.organization.deleteMany({ where: { id: state.orgId } }).catch(() => {});
  }
  if (state.superAdminId) {
    await prisma.user.deleteMany({ where: { id: state.superAdminId } }).catch(() => {});
  }
}

async function main() {
  console.log(`Verifying local attendance features at ${apiUrl.origin} ...`);

  const overnightEvaluation = evaluateAttendance(new Date('2026-08-22T01:00:00.000Z'), {
    openTime: '22:00',
    closeTime: '06:00',
    timezone: 'UTC',
    graceMinutes: 30,
    lateAfterMinutes: 90,
    latePenalty: 10,
  });
  assert.deepEqual(overnightEvaluation, { status: 'LATE', penalty: 10, minutesLate: 180 });
  assert.equal(attendanceDate(new Date('2026-08-22T01:00:00.000Z'), {
    openTime: '22:00',
    closeTime: '06:00',
    timezone: 'UTC',
    openingReference: new Date('2026-08-21T21:50:00.000Z'),
  }).toISOString(), '2026-08-21T00:00:00.000Z');
  step('overnight work-day and lateness calculations are anchored correctly');

  const health = await fetch(new URL('/health', apiUrl.origin));
  assert.equal(health.status, 200, 'The local backend health endpoint is unavailable');
  step('local backend is healthy');

  const platformOrg = await prisma.organization.findUnique({ where: { id: 'platform-org' } });
  assert(platformOrg, 'The platform organization is missing. Run npm run db:seed first.');

  state.superAdminId = uuidv4();
  const superEmail = `verify-super-${runId}@timelogic.local`;
  await prisma.user.create({
    data: {
      id: state.superAdminId,
      orgId: platformOrg.id,
      firstName: 'Local',
      lastName: 'Verifier',
      email: superEmail,
      passwordHash: await bcrypt.hash(password, Number(env.BCRYPT_ROUNDS) || 12),
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });

  const superLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: superEmail, password },
  });
  const superToken = superLogin.payload.data.accessToken;
  assert(superToken);
  step('temporary Super Admin authenticated locally');

  const orgName = `Local Feature Verification ${runId}`;
  const adminEmail = `verify-admin-${runId}@timelogic.local`;
  const orgResponse = await request('/super/organizations', {
    method: 'POST',
    token: superToken,
    expected: [201],
    body: {
      name: orgName,
      industry: 'Local verification',
      subscriptionTier: 'enterprise',
      allowDeviceCheckIn: true,
      allowManualCheckIn: true,
      hasStudents: true,
      openingTime: '00:00',
      timezone: 'UTC',
      offices: [{
        name: 'Verification Office',
        timezone: 'UTC',
        openTime: '00:00',
        closeTime: '23:59',
        graceMinutes: 0,
        lateAfterMinutes: 1,
        gracePenalty: 5,
        latePenalty: 11,
      }],
      admin: {
        firstName: 'Verification',
        lastName: 'Admin',
        email: adminEmail,
        password,
      },
    },
  });
  state.orgId = orgResponse.payload.data.org.id;
  const officeId = orgResponse.payload.data.offices[0].id;
  assert.equal(orgResponse.payload.data.org.allowManualCheckIn, true);
  assert.equal(orgResponse.payload.data.org.hasStudents, true);
  step('Super Admin organization capabilities persisted');

  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: adminEmail, password },
  });
  const adminToken = adminLogin.payload.data.accessToken;
  assert(adminToken);
  assert(adminLogin.payload.data.adminLogin?.loggedInAt);
  const loginEvent = await prisma.adminLoginEvent.findFirst({
    where: { adminId: orgResponse.payload.data.adminUser.id },
    orderBy: { loggedInAt: 'desc' },
  });
  assert(loginEvent?.loggedInAt);
  step('Admin login time was stored in the database');

  const manualEmail = `verify-manual-${runId}@timelogic.local`;
  const manualEmployee = await request('/admin/employees', {
    method: 'POST',
    token: adminToken,
    expected: [201],
    body: {
      firstName: 'Manual',
      lastName: 'Employee',
      email: manualEmail,
      employeeCode: `MAN-${runId}`,
      password,
      checkInMethod: 'MANUAL',
    },
  });
  const manualEmployeeId = manualEmployee.payload.data.id;
  assert.equal(manualEmployee.payload.data.checkInMethod, 'MANUAL');

  const phoneEmail = `verify-phone-${runId}@timelogic.local`;
  const phoneEmployee = await request('/admin/employees', {
    method: 'POST',
    token: adminToken,
    expected: [201],
    body: {
      firstName: 'Phone',
      lastName: 'Employee',
      email: phoneEmail,
      employeeCode: `PHN-${runId}`,
      password,
      checkInMethod: 'PHONE',
    },
  });
  assert.equal(phoneEmployee.payload.data.checkInMethod, 'PHONE');
  step('employee PHONE/MANUAL methods persisted');

  const manualPhoneLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: manualEmail, password, deviceFingerprint: `verify-manual-device-${runId}` },
    expected: [403],
  });
  assert.match(manualPhoneLogin.payload.message, /manual check-in/i);
  const missingDevice = await request('/auth/login', {
    method: 'POST',
    body: { email: phoneEmail, password },
    expected: [400],
  });
  assert.equal(missingDevice.payload.code, 'DEVICE_REQUIRED');
  const phoneLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: phoneEmail, password, deviceFingerprint: `verify-phone-device-${runId}` },
  });
  assert(phoneLogin.payload.data.accessToken);
  step('mobile login enforces method and registered-device rules');

  const sessionResponse = await request('/sessions', {
    method: 'POST',
    token: adminToken,
    expected: [201],
    body: { sessionName: 'Local Verification Session', officeId },
  });
  state.sessionId = sessionResponse.payload.data.session.id;
  assert.equal(sessionResponse.payload.data.session.status, 'ACTIVE');
  const adminAttendance = await prisma.attendanceRecord.findFirst({
    where: { employeeId: orgResponse.payload.data.adminUser.id, sessionId: state.sessionId, checkInSource: 'ADMIN_LOGIN' },
  });
  assert(adminAttendance?.clockInTime);
  assert.equal(adminAttendance.status, adminLogin.payload.data.adminLogin.status);
  step('active office session created with local opening/closing rules');
  step('admin login attendance row is visible in the shared attendance records');

  const dashboard = await request(`/admin/manual-attendance?sessionId=${state.sessionId}&limit=200`, { token: adminToken });
  assert.equal(dashboard.payload.data.enabled, true);
  assert(dashboard.payload.data.employees.some((employee) => employee.id === manualEmployeeId));

  await request('/admin/manual-attendance/check-in', {
    method: 'POST',
    token: adminToken,
    expected: [403],
    body: { employeeId: manualEmployeeId, sessionId: state.sessionId, password: 'WrongPassword@123' },
  });
  const stillAuthenticated = await request('/auth/me', { token: adminToken });
  assert.equal(stillAuthenticated.payload.data.id, orgResponse.payload.data.adminUser.id);

  const beforeCheckIn = Date.now();
  const manualCheckIn = await request('/admin/manual-attendance/check-in', {
    method: 'POST',
    token: adminToken,
    expected: [201],
    body: {
      employeeId: manualEmployeeId,
      sessionId: state.sessionId,
      password,
      clockInTime: '2000-01-01T00:00:00.000Z',
      status: 'PRESENT',
      penalty: 0,
    },
  });
  const afterCheckIn = Date.now();
  const recordedAt = new Date(manualCheckIn.payload.data.record.clockInTime).getTime();
  // The authoritative network clock may be a few seconds ahead of this test
  // process, so allow the bounded synchronization offset while rejecting stale
  // or client-supplied timestamps.
  const clockSkewAllowance = 15_000;
  assert(recordedAt >= beforeCheckIn - clockSkewAllowance && recordedAt <= afterCheckIn + clockSkewAllowance);
  assert.equal(manualCheckIn.payload.data.record.checkInSource, 'MANUAL');
  assert.equal(manualCheckIn.payload.data.record.checkInRecordedById, orgResponse.payload.data.adminUser.id);
  assert.equal(manualCheckIn.payload.data.record.penalty, manualCheckIn.payload.data.penalty);
  step('manual check-in uses server time and backend penalty evaluation');

  await request('/admin/manual-attendance/check-in', {
    method: 'POST',
    token: adminToken,
    expected: [409],
    body: { employeeId: manualEmployeeId, sessionId: state.sessionId, password },
  });
  await request(`/super/organizations/${state.orgId}`, {
    method: 'PUT',
    token: superToken,
    expected: [409],
    body: { allowManualCheckIn: false },
  });
  step('duplicate attendance and unsafe capability changes are blocked');

  const crossTenant = await request('/admin/manual-attendance/check-out', {
    method: 'POST',
    token: superToken,
    expected: [404],
    body: { employeeId: manualEmployeeId, sessionId: state.sessionId, password },
  });
  assert.match(crossTenant.payload.message, /not found/i);

  await request('/admin/manual-attendance/check-out', {
    method: 'POST',
    token: adminToken,
    expected: [400],
    body: { employeeId: manualEmployeeId, sessionId: state.sessionId, password },
  });
  step('manual check-out is blocked before the office close time');

  const closeNow = new Date();
  await prisma.office.update({
    where: { id: officeId },
    data: { closeTime: `${String(closeNow.getUTCHours()).padStart(2, '0')}:${String(closeNow.getUTCMinutes()).padStart(2, '0')}` },
  });
  const manualCheckOut = await request('/admin/manual-attendance/check-out', {
    method: 'POST',
    token: adminToken,
    body: { employeeId: manualEmployeeId, sessionId: state.sessionId, password },
  });
  assert.equal(manualCheckOut.payload.data.record.checkOutSource, 'MANUAL');
  assert.equal(manualCheckOut.payload.data.record.checkOutRecordedById, orgResponse.payload.data.adminUser.id);
  step('manual check-out is audited and tenant-isolated');

  const student = await request('/admin/students', {
    method: 'POST',
    token: adminToken,
    expected: [201],
    body: {
      firstName: 'Student',
      lastName: 'Verifier',
      studentCode: `STU-${runId}`,
      className: 'Local Test',
    },
  });
  const studentId = student.payload.data.id;
  const studentCheckIn = await request(`/admin/students/${studentId}/check-in`, {
    method: 'POST',
    token: adminToken,
    expected: [201],
  });
  assert(studentCheckIn.payload.data.checkInTime);
  assert.equal(studentCheckIn.payload.data.checkedInById, orgResponse.payload.data.adminUser.id);
  await request(`/super/organizations/${state.orgId}`, {
    method: 'PUT',
    token: superToken,
    expected: [409],
    body: { hasStudents: false },
  });
  await request(`/admin/students/${studentId}/check-in`, {
    method: 'POST',
    token: adminToken,
    expected: [409],
  });
  const studentCheckOut = await request(`/admin/students/${studentId}/check-out`, {
    method: 'POST',
    token: adminToken,
  });
  assert(studentCheckOut.payload.data.checkOutTime);
  assert.equal(studentCheckOut.payload.data.checkedOutById, orgResponse.payload.data.adminUser.id);
  const students = await request('/admin/students?status=ALL&limit=200', { token: adminToken });
  assert(students.payload.data.students.some((item) => item.id === studentId));
  step('student check-in/out works without an employee session or penalty input');

  const disabledStudents = await request(`/super/organizations/${state.orgId}`, {
    method: 'PUT',
    token: superToken,
    body: { hasStudents: false },
  });
  assert.equal(disabledStudents.payload.data.hasStudents, false);
  await request('/admin/students?status=ALL', { token: adminToken, expected: [403] });

  const disabledManual = await request(`/super/organizations/${state.orgId}`, {
    method: 'PUT',
    token: superToken,
    body: { allowManualCheckIn: false },
  });
  assert.equal(disabledManual.payload.data.allowManualCheckIn, false);
  const disabledDashboard = await request('/admin/manual-attendance', { token: adminToken });
  assert.equal(disabledDashboard.payload.data.enabled, false);
  const migratedEmployee = await prisma.user.findUnique({ where: { id: manualEmployeeId } });
  assert.equal(migratedEmployee.checkInMethod, 'PHONE');
  step('Super Admin capability switches are enforced and employees remain usable');

  await prisma.attendanceSession.delete({ where: { id: state.sessionId } });
  state.sessionId = null;

  await prisma.office.update({
    where: { id: officeId },
    data: { openTime: '22:00', closeTime: '06:00', timezone: 'UTC' },
  });
  const overnightSessionId = uuidv4();
  state.sessionId = overnightSessionId;
  await prisma.attendanceSession.create({
    data: {
      id: overnightSessionId,
      sessionName: 'Synthetic Overnight Verification',
      officeId,
      officeName: 'Verification Office',
      orgName,
      createdBy: orgResponse.payload.data.adminUser.id,
      startTime: new Date('2026-08-20T21:50:00.000Z'),
      endTime: new Date('2026-08-21T06:00:00.000Z'),
      status: 'ENDED',
    },
  });
  const overnightLoginAt = new Date('2026-08-21T01:00:00.000Z');
  await prisma.adminLoginEvent.create({
    data: {
      id: uuidv4(),
      adminId: orgResponse.payload.data.adminUser.id,
      orgId: state.orgId,
      loggedInAt: overnightLoginAt,
      attendanceStatus: 'LATE',
      minutesLate: 180,
      penalty: 11,
    },
  });
  await AttendanceService.syncAdminAttendanceForSession(overnightSessionId, orgResponse.payload.data.adminUser.id);
  const overnightAdminRecord = await prisma.attendanceRecord.findFirst({
    where: { employeeId: orgResponse.payload.data.adminUser.id, sessionId: overnightSessionId },
  });
  assert(overnightAdminRecord);
  assert.equal(overnightAdminRecord.date.toISOString(), '2026-08-20T00:00:00.000Z');
  assert.equal(overnightAdminRecord.clockInTime.toISOString(), overnightLoginAt.toISOString());
  await prisma.attendanceSession.delete({ where: { id: overnightSessionId } });
  state.sessionId = null;
  step('post-midnight Admin login is synced to its overnight session');

  const deleted = await request(`/super/organizations/${state.orgId}`, {
    method: 'DELETE',
    token: superToken,
  });
  assert.equal(deleted.payload.success, true);
  state.orgId = null;
  step('temporary organization was removed cleanly');

  console.log('Local feature verification passed.');
}

main()
  .catch((error) => {
    console.error(`Local feature verification failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    redis.disconnect();
  });
