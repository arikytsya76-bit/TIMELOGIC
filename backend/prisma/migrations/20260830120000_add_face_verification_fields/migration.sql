-- Check and add faceEncodingData column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='faceEncodingData') THEN
    ALTER TABLE "users" ADD COLUMN "faceEncodingData" BYTEA;
  END IF;
END $$;

-- Check and add faceBlockedUntil column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='faceBlockedUntil') THEN
    ALTER TABLE "users" ADD COLUMN "faceBlockedUntil" TIMESTAMP(3);
  END IF;
END $$;

-- Check and add faceMismatchCount column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='faceMismatchCount') THEN
    ALTER TABLE "users" ADD COLUMN "faceMismatchCount" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Check and add faceLastMismatchAt column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='faceLastMismatchAt') THEN
    ALTER TABLE "users" ADD COLUMN "faceLastMismatchAt" TIMESTAMP(3);
  END IF;
END $$;
