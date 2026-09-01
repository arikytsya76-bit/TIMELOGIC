#!/bin/bash
# Root-level start script for Render deployment
# This script must be run from the project root directory

cd "$(dirname "$0")/backend"

# Run the cleanup first, then start migrations and server
node scripts/clear-failed-migrations.js && npx prisma migrate deploy && node src/server.js
