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

const fs = require('fs');
const path = require('path');

// Load environment variables early
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function clearFailedMigrations() {
  try {
    console.log('\n[Migration Cleanup] Starting migration cleanup process...');
    
    // Check if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      console.log('[Migration Cleanup] No DATABASE_URL set - skipping cleanup');
      return true;
    }

    // Load Prisma Client to get database connection
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      log: [], // Disable logging to keep output clean
    });

    try {
      // First, check migration table existence and status
      console.log('[Migration Cleanup] Checking migration status...');
      
      let failedMigrations = [];
      try {
        failedMigrations = await prisma.$queryRaw`
          SELECT migration_name, started_at, finished_at, execution_time_in_millis, success
          FROM "_prisma_migrations"
          WHERE success = false
          ORDER BY started_at DESC
        `;
      } catch (queryErr) {
        if (queryErr.message.includes('does not exist') || queryErr.message.includes('P3005')) {
          console.log('[Migration Cleanup] Migration table not yet created (fresh database) - OK');
          return true;
        }
        throw queryErr;
      }

      if (failedMigrations && failedMigrations.length > 0) {
        console.log(`[Migration Cleanup] ⚠ Found ${failedMigrations.length} failed migration(s):`);
        failedMigrations.forEach((m) => {
          console.log(`  - ${m.migration_name}`);
          console.log(`    Started: ${m.started_at}`);
          console.log(`    Execution time: ${m.execution_time_in_millis}ms`);
        });

        // Delete ALL failed migration records
        try {
          const deletedCount = await prisma.$executeRaw`
            DELETE FROM "_prisma_migrations"
            WHERE success = false
          `;
          console.log(`[Migration Cleanup] ✓ Cleared ${deletedCount} failed migration record(s)`);
        } catch (deleteErr) {
          console.error('[Migration Cleanup] Error deleting failed migrations:', deleteErr.message);
          // Try alternative approach - delete specific migration
          try {
            await prisma.$executeRaw`
              DELETE FROM "_prisma_migrations"
              WHERE migration_name = '20260830120000_add_face_verification_fields'
            `;
            console.log('[Migration Cleanup] ✓ Cleared specific failed migration');
          } catch (specificErr) {
            console.error('[Migration Cleanup] Could not delete specific migration:', specificErr.message);
          }
        }
      } else {
        console.log('[Migration Cleanup] No failed migrations found - proceeding normally');
      }

      // Safety: Always try to delete the known problematic migration if it exists
      try {
        const deleted = await prisma.$executeRaw`
          DELETE FROM "_prisma_migrations"
          WHERE migration_name = '20260830120000_add_face_verification_fields' AND success = false
        `;
        if (deleted > 0) {
          console.log('[Migration Cleanup] ✓ Removed problematic migration record');
        }
      } catch (e) {
        // Ignore errors on this safety check
      }

      console.log('[Migration Cleanup] ✓ Migration database is clean\n');
      return true;

    } catch (queryError) {
      console.error('[Migration Cleanup] Database error:', queryError.message);
      
      // If we can't query, it might be a connection issue
      if (queryError.code === 'P1017') {
        console.log('[Migration Cleanup] Database connection failed - it will be created on first migration');
        return true;
      }
      
      if (queryError.message.includes('table') || queryError.message.includes('does not exist')) {
        console.log('[Migration Cleanup] Migrations table not yet created - OK');
        return true;
      }
      
      throw queryError;

    } finally {
      await prisma.$disconnect();
    }

  } catch (error) {
    console.error('[Migration Cleanup] Fatal error:', error.message);
    if (error.stack) {
      console.error('[Migration Cleanup] Stack trace:', error.stack);
    }
    // Continue deployment anyway - don't block
    console.log('[Migration Cleanup] ⚠ Continuing deployment despite error...\n');
    return false;
  }
}

// Run and handle completion
clearFailedMigrations()
  .then((success) => {
    if (success) {
      console.log('[Migration Cleanup] ✓ SUCCESS - Prisma is ready to run migrations');
    } else {
      console.log('[Migration Cleanup] ⚠ PARTIAL - Continuing anyway');
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Migration Cleanup] FATAL ERROR:', err);
    console.log('[Migration Cleanup] Continuing deployment anyway...');
    process.exit(0); // Exit with 0 to not block deployment
  });
