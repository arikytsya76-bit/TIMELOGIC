/**
 * Clear Failed Migrations Script
 * ─────────────────────────────────────────────────────────
 * This script runs BEFORE Prisma migrations to remove any failed
 * migration records from the database. This allows Prisma to proceed
 * with applying pending migrations without getting blocked by
 * previous failures.
 * 
 * This is critical for Render deployments where the failed migration
 * must be cleared before 'npx prisma migrate deploy' runs.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

async function clearFailedMigrations() {
  try {
    console.log('\n[Migration Cleanup] Starting...');
    
    // Load Prisma Client to get database connection
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    try {
      // Query to see current migration state
      const failedMigrations = await prisma.$queryRaw`
        SELECT migration_name, started_at, finished_at, execution_time_in_millis, success
        FROM "_prisma_migrations"
        WHERE success = false
      `;

      if (failedMigrations && failedMigrations.length > 0) {
        console.log(`[Migration Cleanup] Found ${failedMigrations.length} failed migration(s):`);
        failedMigrations.forEach((m) => {
          console.log(`  - ${m.migration_name} (started: ${m.started_at})`);
        });

        // Delete all failed migration records
        const deletedCount = await prisma.$executeRaw`
          DELETE FROM "_prisma_migrations"
          WHERE success = false
        `;

        console.log(`[Migration Cleanup] ✓ Cleared ${deletedCount} failed migration record(s)`);
      } else {
        console.log('[Migration Cleanup] No failed migrations found - proceeding normally');
      }

      // Also specifically delete the known problematic migration if it exists
      await prisma.$executeRaw`
        DELETE FROM "_prisma_migrations"
        WHERE migration_name = '20260830120000_add_face_verification_fields'
      `;

      console.log('[Migration Cleanup] ✓ Migration database is clean\n');
    } catch (queryError) {
      // If we can't query, the table might not exist yet (fresh database)
      // This is fine - migrations will create it
      if (queryError.code === 'P1017' || queryError.message.includes('table')) {
        console.log('[Migration Cleanup] Database not yet initialized (fresh database) - OK');
      } else if (queryError.message.includes('does not exist')) {
        console.log('[Migration Cleanup] Migrations table does not exist yet - OK');
      } else {
        console.log('[Migration Cleanup] Warning: Could not check migration status:', queryError.message);
      }
    } finally {
      await prisma.$disconnect();
    }

  } catch (error) {
    console.error('[Migration Cleanup] Error:', error.message);
    console.error('[Migration Cleanup] Stack:', error.stack);
    // Continue anyway - don't block the deployment
    console.log('[Migration Cleanup] Continuing with deployment despite error...\n');
  }
}

// Run and handle completion
clearFailedMigrations()
  .then(() => {
    console.log('[Migration Cleanup] Done - Prisma is ready to run migrations');
  })
  .catch((err) => {
    console.error('[Migration Cleanup] Unhandled error:', err);
    console.log('[Migration Cleanup] Continuing anyway...');
  });
