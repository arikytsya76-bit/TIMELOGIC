/**
 * Minimal seed — creates only the Super Admin account.
 * No dummy organizations, employees, or demo data.
 *
 * Run:  npm run db:seed
 *
 * After seeding, login at the Super Admin web panel:
 *   Email:    superadmin@acme.com
 *   Password: Admin@1234
 *
 * Then use "Add Organization" in the web panel to create real organizations.
 * Each organization's admin credentials you set there will be used to login
 * to the Desktop Admin panel.
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Super Admin account...');

  const hash = await bcrypt.hash('Admin@1234', 12);

  // Super Admin needs an orgId (schema constraint).
  // We create a minimal platform org — it is NOT a real tenant org.
  const platformOrg = await prisma.organization.upsert({
    where: { id: 'platform-org' },
    update: {},
    create: {
      id: 'platform-org',
      name: 'Platform',
      industry: 'Technology',
      subscriptionTier: 'enterprise',
    },
  });

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@acme.com' },
    update: {
      orgId: platformOrg.id,
      firstName: 'Super',
      lastName: 'Admin',
      employeeCode: 'SA001',
      passwordHash: hash,
      status: 'ACTIVE',
      role: 'SUPER_ADMIN',
    },
    create: {
      id: uuidv4(),
      orgId: platformOrg.id,
      firstName: 'Super',
      lastName: 'Admin',
      email: 'superadmin@acme.com',
      employeeCode: 'SA001',
      passwordHash: hash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });

  // Re-seeding resets the development password, so revoke every old session.
  await prisma.refreshToken.deleteMany({ where: { userId: superAdmin.id } });

  console.log('\n✓ Super Admin ready');
  console.log('─────────────────────────────────────────');
  console.log('  Web Panel  →  superadmin@acme.com');
  console.log('  Password   →  Admin@1234');
  console.log('─────────────────────────────────────────');
  console.log('\nNext steps:');
  console.log('  1. Open http://localhost:3000');
  console.log('  2. Login with the credentials above');
  console.log('  3. Go to Organizations → Add Organization');
  console.log('  4. Fill the form — set the admin email & password');
  console.log('  5. That admin logs into the Desktop panel with those credentials');
}

main()
  .catch((error) => {
    console.error('Database seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
