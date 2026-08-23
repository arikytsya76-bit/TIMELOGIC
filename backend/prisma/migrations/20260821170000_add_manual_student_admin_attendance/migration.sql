CREATE TYPE "EmployeeCheckInMethod" AS ENUM ('PHONE', 'MANUAL', 'BOTH');
CREATE TYPE "AttendanceSource" AS ENUM ('PHONE', 'MANUAL', 'ADMIN_LOGIN', 'SYSTEM');
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TABLE "organizations"
  ADD COLUMN "allowDeviceCheckIn" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowManualCheckIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hasStudents" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "openingTime" TEXT NOT NULL DEFAULT '08:00',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- Preserve the opening-time behavior of existing tenants by copying their
-- first-created office schedule into the new organization-level admin policy.
UPDATE "organizations" AS org
SET
  "openingTime" = COALESCE((
    SELECT office."openTime"
    FROM "offices" AS office
    WHERE office."orgId" = org."id"
    ORDER BY office."createdAt" ASC
    LIMIT 1
  ), org."openingTime"),
  "timezone" = COALESCE((
    SELECT office."timezone"
    FROM "offices" AS office
    WHERE office."orgId" = org."id"
    ORDER BY office."createdAt" ASC
    LIMIT 1
  ), org."timezone");

ALTER TABLE "users"
  ADD COLUMN "checkInMethod" "EmployeeCheckInMethod" NOT NULL DEFAULT 'PHONE',
  ADD COLUMN "phone" TEXT;

ALTER TABLE "attendance_records"
  ADD COLUMN "checkInSource" "AttendanceSource" NOT NULL DEFAULT 'PHONE',
  ADD COLUMN "checkOutSource" "AttendanceSource",
  ADD COLUMN "checkInRecordedById" TEXT,
  ADD COLUMN "checkOutRecordedById" TEXT;

-- Existing admin rows came from the legacy admin-presence path, not a phone.
UPDATE "attendance_records" AS record
SET "checkInSource" = 'ADMIN_LOGIN'
WHERE EXISTS (
  SELECT 1 FROM "users" AS account
  WHERE account."id" = record."employeeId"
    AND account."role" = 'ADMIN'
);

CREATE TABLE "admin_login_events" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "loggedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attendanceStatus" "AttendanceStatus" NOT NULL,
  "minutesLate" INTEGER NOT NULL DEFAULT 0,
  "penalty" INTEGER NOT NULL DEFAULT 0,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  CONSTRAINT "admin_login_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "students" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "studentCode" TEXT NOT NULL,
  "className" TEXT,
  "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_attendance" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "checkInTime" TIMESTAMP(3) NOT NULL,
  "checkOutTime" TIMESTAMP(3),
  "checkedInById" TEXT,
  "checkedOutById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_attendance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_login_events_adminId_loggedInAt_idx"
  ON "admin_login_events"("adminId", "loggedInAt");
CREATE INDEX "admin_login_events_orgId_loggedInAt_idx"
  ON "admin_login_events"("orgId", "loggedInAt");
CREATE UNIQUE INDEX "students_orgId_studentCode_key"
  ON "students"("orgId", "studentCode");
CREATE INDEX "students_orgId_status_idx" ON "students"("orgId", "status");
CREATE UNIQUE INDEX "student_attendance_studentId_date_key"
  ON "student_attendance"("studentId", "date");
CREATE INDEX "student_attendance_date_idx" ON "student_attendance"("date");

ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_checkInRecordedById_fkey"
  FOREIGN KEY ("checkInRecordedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "attendance_records_checkOutRecordedById_fkey"
  FOREIGN KEY ("checkOutRecordedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "admin_login_events"
  ADD CONSTRAINT "admin_login_events_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "admin_login_events_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "students"
  ADD CONSTRAINT "students_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_attendance"
  ADD CONSTRAINT "student_attendance_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "students"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_checkedInById_fkey"
  FOREIGN KEY ("checkedInById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_checkedOutById_fkey"
  FOREIGN KEY ("checkedOutById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
