ALTER TABLE "organizations"
  ALTER COLUMN "timezone" SET DEFAULT 'Africa/Lagos';

ALTER TABLE "offices"
  ALTER COLUMN "timezone" SET DEFAULT 'Africa/Lagos';

UPDATE "organizations"
SET "timezone" = 'Africa/Lagos'
WHERE "timezone" IS NULL OR "timezone" = 'UTC';

UPDATE "offices"
SET "timezone" = 'Africa/Lagos'
WHERE "timezone" IS NULL OR "timezone" = 'UTC';