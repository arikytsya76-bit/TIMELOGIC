-- Organization admins authenticate by email; legacy admin identifiers are no longer used.
UPDATE "users" SET "employeeCode" = NULL WHERE "role" IN ('ADMIN', 'SUPER_ADMIN');
