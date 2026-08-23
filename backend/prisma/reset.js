/**
 * Resets the database — wipes ALL data except the Super Admin account.
 * Organizations, admins, employees, sessions, attendance, breaks, leaves — all cleared.
 *
 * Run:  npm run db:reset
 *
 * After reset, log in at the Super Admin panel and create organizations from scratch.
 * Super Admin credentials remain:
 *   Email:    superadmin@acme.com
 *   Password: Admin@1234
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Resetting database (keeping Super Admin)...\n');

  // Delete in FK-safe order — most dependent first
  const steps = [
    ['notificationLog',        () => prisma.notificationLog.deleteMany()],
    ['attendanceReport',       () => prisma.attendanceReport.deleteMany()],
    ['emergencyControlSession',() => prisma.emergencyControlSession.deleteMany()],
    ['emergencyControl',       () => prisma.emergencyControl.deleteMany()],
    ['fraudAlert',             () => prisma.fraudAlert.deleteMany()],
    ['screenshotLog',          () => prisma.screenshotLog.deleteMany()],
    ['selfieVerification',     () => prisma.selfieVerification.deleteMany()],
    ['scanAttempt',            () => prisma.scanAttempt.deleteMany()],
    ['breakRecord',            () => prisma.breakRecord.deleteMany()],
    ['attendanceRecord',       () => prisma.attendanceRecord.deleteMany()],
    ['studentAttendance',      () => prisma.studentAttendance.deleteMany()],
    ['student',                () => prisma.student.deleteMany()],
    ['qRToken',                () => prisma.qRToken.deleteMany()],
    ['attendanceSession',      () => prisma.attendanceSession.deleteMany()],
    ['leaveRequest',           () => prisma.leaveRequest.deleteMany()],
    ['leaveBalance',           () => prisma.leaveBalance.deleteMany()],
    ['registeredDevice',       () => prisma.registeredDevice.deleteMany()],
    ['adminLoginEvent',        () => prisma.adminLoginEvent.deleteMany()],
    ['adminPermission',        () => prisma.adminPermission.deleteMany()],
    ['refreshToken',           () => prisma.refreshToken.deleteMany()],
    ['breakPolicy',            () => prisma.breakPolicy.deleteMany()],
    ['securitySettings',       () => prisma.securitySettings.deleteMany()],
    ['wiFiFingerprint',        () => prisma.wiFiFingerprint.deleteMany()],
    // Delete all non-super-admin users
    ['users (non-SA)',         () => prisma.user.deleteMany({ where: { role: { not: 'SUPER_ADMIN' } } })],
    // Departments and offices (belong to orgs that will be deleted)
    ['department',             () => prisma.department.deleteMany()],
    ['office',                 () => prisma.office.deleteMany()],
    // Delete all organizations EXCEPT the platform org
    ['organization',           () => prisma.organization.deleteMany({ where: { id: { not: 'platform-org' } } })],
  ];

  for (const [name, fn] of steps) {
    try {
      const result = await fn();
      console.log(`  ✓ Cleared ${name}${result?.count !== undefined ? ` (${result.count} rows)` : ''}`);
    } catch (err) {
      console.warn(`  ✗ Skipped ${name}: ${err.message}`);
    }
  }

  const sa = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { email: true, status: true } });

  console.log('\n──────────────────────────────────────────');
  console.log('  Database reset complete.');
  console.log(`  Super Admin preserved: ${sa?.email ?? 'not found'}`);
  console.log('──────────────────────────────────────────');
  console.log('  Next: log in at the Super Admin panel');
  console.log('  and create your organizations.\n');
}

main()
  .catch((error) => {
    console.error('Database reset failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
