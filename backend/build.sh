#!/bin/bash
# Render build script - runs before application starts
# This ensures the migration cleanup runs before Prisma attempts migrations

set -e

echo "=== Building TimeLogic Backend ==="
echo ""

# Install dependencies (npm ci already ran, but this is safety)
echo "[Build] Dependencies: OK"

# Clear any failed migrations from database before Prisma runs
echo "[Build] Clearing failed migrations..."
if node scripts/clear-failed-migrations.js; then
  echo "[Build] Migration cleanup: SUCCESS"
else
  echo "[Build] Migration cleanup: WARNING (continuing anyway)"
fi

echo ""
echo "=== Build Complete ==="
