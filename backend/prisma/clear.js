/**
 * Clears ALL data from the database while preserving the schema.
 * Run with: npm run db:clear
 *
 * Order matters — delete dependent tables first to avoid FK violations.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Clearing all data...');

  const tables = [
    'notificationLog',
    'attendanceReport',
    'emergencyControlSession',
    'emergencyControl',
    'fraudAlert',
    'screenshotLog',
    'selfieVerification',
    'scanAttempt',
    'breakRecord',
    'attendanceRecord',
    'studentAttendance',
    'student',
    'qRToken',
    'attendanceSession',
    'leaveRequest',
    'leaveBalance',
    'registeredDevice',
    'adminLoginEvent',
    'adminPermission',
    'refreshToken',
    'breakPolicy',
    'securitySettings',
    'wiFiFingerprint',
    'user',
    'department',
    'office',
    'organization',
  ];

  for (const table of tables) {
    try {
      await prisma[table].deleteMany({});
      console.log(`  ✓ Cleared ${table}`);
    } catch (err) {
      console.warn(`  ✗ Skipped ${table}: ${err.message}`);
    }
  }

  console.log('\nDatabase cleared. Run npm run db:seed to add fresh seed data,');
  console.log('or leave empty and let Super Admin create organizations.');
}

main()
  .catch((error) => {
    console.error('Database clear failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
