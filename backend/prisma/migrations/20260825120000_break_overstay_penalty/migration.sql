-- Preserve existing break history while recording manual overstay penalties.
ALTER TABLE "break_policies" ADD COLUMN "overstayPenalty" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "break_records" ADD COLUMN "penalty" INTEGER NOT NULL DEFAULT 0;
