/**
 * This script clears any failed migration records so Prisma can proceed
 * It's run before the server starts to ensure the database is in a consistent state
 */
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

async function clearFailedMigrations() {
  try {
    // Check if we're in production (Render sets NODE_ENV)
    const isProd = process.env.NODE_ENV === 'production';
    
    if (!isProd) {
      console.log('[Migration Check] Development mode - skipping migration resolution');
      return;
    }

    console.log('[Migration Check] Attempting to clear any failed migrations...');
    
    // Try to remove failed migration record if it exists
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const deleted = await prisma.$executeRawUnsafe(
        `DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260830120000_add_face_verification_fields' AND success = false`
      );
      
      if (deleted > 0) {
        console.log('[Migration Check] ✓ Cleared failed migration record');
      }
      
      await prisma.$disconnect();
    } catch (dbError) {
      // If the table doesn't exist yet or other DB error, that's okay
      console.log('[Migration Check] Could not check migration status (DB may not be initialized yet)');
    }

  } catch (error) {
    console.error('[Migration Check] Error:', error.message);
    // Don't fail the startup, just log the error
  }
}

// Run the check
clearFailedMigrations().catch((err) => {
  console.error('[Migration Check] Unexpected error:', err);
  // Continue with startup anyway
});
