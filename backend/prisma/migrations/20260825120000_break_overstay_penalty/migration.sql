-- Preserve existing break history while recording manual overstay penalties.
ALTER TABLE "break_policies" ADD COLUMN "overstayPenalty" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "break_records" ADD COLUMN "penalty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "break_records" ADD COLUMN "startedByAdmin" BOOLEAN NOT NULL DEFAULT false;
UPDATE "break_policies" SET "overstayPenalty" = 50;
