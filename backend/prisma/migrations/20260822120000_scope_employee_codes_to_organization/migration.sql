-- Employee identifiers may repeat across organizations, but remain unique within one organization.
DROP INDEX IF EXISTS "users_employeeCode_key";
CREATE UNIQUE INDEX "users_orgId_employeeCode_key" ON "users"("orgId", "employeeCode");
