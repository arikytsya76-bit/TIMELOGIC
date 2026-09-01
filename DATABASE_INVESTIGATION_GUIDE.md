# Database Investigation Guide - Option B

## Step 1: Access Your Render PostgreSQL Database

### Via Render Dashboard (Easiest)

1. Go to: https://dashboard.render.com
2. Find your **timelogic** PostgreSQL database service
3. Click on it
4. Look for **"Connections"** section or **"External Database URL"**
5. You'll see your PostgreSQL connection string

### Via psql (Command Line)

If you have PostgreSQL client installed locally:

```bash
# Your connection string looks like:
# postgresql://user:password@host:port/database

# Connect:
psql postgresql://user:password@host:port/timelogic
```

### Via pgAdmin (Web UI - Render provides this)

Some Render instances include pgAdmin access. Check your Render dashboard for a link.

---

## Step 2: Run These Investigation Queries

Once connected to the database, run these SQL commands in order:

### Query 1: Check if the 4 face columns exist

```sql
SELECT 
  column_name, 
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('faceEncodingData', 'faceBlockedUntil', 'faceMismatchCount', 'faceLastMismatchAt')
ORDER BY column_name;
```

**Expected output if columns exist:**
```
    column_name     |     data_type      | is_nullable
--------------------+--------------------+-------------
faceBlockedUntil   | timestamp without  | YES
faceEncodingData   | bytea              | YES
faceLastMismatchAt | timestamp without  | YES
faceMismatchCount  | integer            | YES
```

**If columns DON'T exist, output will be empty (0 rows)**

### Query 2: Check the migration history table

```sql
SELECT 
  migration_name, 
  started_at, 
  finished_at,
  success,
  EXTRACT(EPOCH FROM (finished_at - started_at))::INTEGER as duration_seconds
FROM "_prisma_migrations"
WHERE migration_name LIKE '%face%' OR migration_name LIKE '%20260830%'
ORDER BY started_at DESC;
```

**This shows:**
- The `20260830000_add_face_verification_fields` migration status
- When it started and finished
- Whether it succeeded or failed

### Query 3: List ALL recent migrations

```sql
SELECT 
  migration_name, 
  success, 
  started_at,
  finished_at
FROM "_prisma_migrations"
ORDER BY started_at DESC
LIMIT 25;
```

**This shows the last 25 migrations including:**
- Which ones succeeded (success = true)
- Which ones failed (success = false)
- Execution timestamps

### Query 4: Check specifically for failed migrations

```sql
SELECT 
  migration_name, 
  started_at,
  finished_at
FROM "_prisma_migrations"
WHERE success = false
ORDER BY started_at DESC;
```

**If output is empty: No failed migrations**
**If output shows `20260830000`: That's the problem migration**

---

## Step 3: Interpret the Results

### Scenario A: Columns EXIST + Migration is marked FAILED

```
Conclusion: Migration partially completed
Reason: The ALTER TABLE commands succeeded but Prisma marked it failed anyway
Action: Use prisma migrate resolve --rolled-back

Result: Safe to do because the schema is already correct
```

### Scenario B: Columns DON'T EXIST + Migration is marked FAILED

```
Conclusion: Migration failed before creating columns
Reason: Connection lost, permission error, or syntax error
Action: Restore the migration file and re-deploy (Option A)

Result: Safe because the migration is idempotent
```

### Scenario C: Columns EXIST + No failed migrations in history

```
Conclusion: Database is in good state
Reason: Columns were created, but DB history is clean
Action: Just proceed with deployment

Result: Likely scenario - DB is actually fine
```

### Scenario D: Columns EXIST + Multiple failed migrations

```
Conclusion: More complex history issue
Action: Need to analyze other migrations too
Result: May need manual review
```

---

## Step 4: Taking Action Based on Findings

### If you find: "Columns EXIST + Migration FAILED"

Run this command from your local backend directory:

```bash
cd backend
npx prisma migrate resolve --rolled-back 20260830120000_add_face_verification_fields
```

Then:
```bash
git add prisma/
git commit -m "Resolve failed migration - columns already exist in production"
git push origin main
```

Render will re-deploy and should proceed normally.

### If you find: "Columns DON'T EXIST + Migration FAILED"

Run these commands from your repo root:

```bash
# Restore the migration file
git show d1a4d2a:backend/prisma/migrations/20260830120000_add_face_verification_fields/migration.sql > \
  backend/prisma/migrations/20260830120000_add_face_verification_fields/migration.sql

git add backend/prisma/
git commit -m "Restore face verification migration - will retry with idempotent SQL"
git push origin main
```

Render will re-deploy and apply the migration (it's idempotent, so safe).

### If you find: "Columns EXIST + No failed migrations"

Just make a fresh commit to trigger redeploy:

```bash
git commit --allow-empty -m "Trigger redeploy - database state is healthy"
git push origin main
```

---

## Step 5: Report Back

Please run the 4 queries above and share:

1. **Query 1 output:** Do the 4 columns exist?
2. **Query 2 output:** Is 20260830 in failed migrations?
3. **Query 3 output:** List of recent migrations
4. **Query 4 output:** Any failed migrations?

Or just paste the full output of each query and I'll interpret it.

---

## Troubleshooting Database Access

### "Can't connect to database"
- Verify connection string is correct
- Check that your IP is whitelisted (Render usually allows anywhere)
- Try from a different network

### "SSL error"
- Your connection string might need `?sslmode=require`
- Try: `postgresql://user:password@host:port/database?sslmode=require`

### "Permission denied"
- You might need the database user credentials (not your Render account)
- Check Render dashboard for the actual DB user/password

### "psql command not found"
- Install PostgreSQL: `brew install postgresql` (Mac) or download from postgresql.org
- Or use Render's web UI if available

---

## Safety Notes

✅ These SQL queries are READ-ONLY - they don't modify anything
✅ Safe to run multiple times
✅ Safe to share the output (no credentials revealed)
❌ Don't run any DELETE or UPDATE commands

**Once you have the findings, we'll know exactly which action to take next.**
