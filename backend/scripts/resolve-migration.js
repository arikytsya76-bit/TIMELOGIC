const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function resolveMigration() {
  try {
    // Delete the failed migration record so Prisma can proceed
    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260830120000_add_face_verification_fields'`
    );
    console.log('Migration record removed:', result);
    console.log('The failed migration has been cleared. Prisma will now proceed with new migrations.');
  } catch (error) {
    console.error('Error resolving migration:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resolveMigration();
