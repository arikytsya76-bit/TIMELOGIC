-- Add face verification columns (idempotent - checks if columns exist)
-- These columns support face verification lockout and fraud detection

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='faceEncodingData') THEN
    ALTER TABLE "users" ADD COLUMN "faceEncodingData" BYTEA;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='faceBlockedUntil') THEN
    ALTER TABLE "users" ADD COLUMN "faceBlockedUntil" TIMESTAMP(3);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='faceMismatchCount') THEN
    ALTER TABLE "users" ADD COLUMN "faceMismatchCount" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='faceLastMismatchAt') THEN
    ALTER TABLE "users" ADD COLUMN "faceLastMismatchAt" TIMESTAMP(3);
  END IF;
END $$;
