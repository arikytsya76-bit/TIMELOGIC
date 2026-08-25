-- Additive compatibility migration for databases that already applied the prior break migration.
ALTER TABLE "break_records" ADD COLUMN IF NOT EXISTS "startedByAdmin" BOOLEAN NOT NULL DEFAULT false;
