-- Existing releases issued opaque UUIDs but attempted to verify refresh tokens
-- as JWTs. They cannot be refreshed, so remove only those legacy rows.
DELETE FROM "refresh_tokens"
WHERE "token" NOT LIKE '%.%.%';

-- Clean up any rows left behind by users deleted before the FK existed.
DELETE FROM "refresh_tokens" AS rt
WHERE NOT EXISTS (
  SELECT 1 FROM "users" AS u WHERE u."id" = rt."userId"
);

CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

ALTER TABLE "refresh_tokens"
ADD CONSTRAINT "refresh_tokens_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
