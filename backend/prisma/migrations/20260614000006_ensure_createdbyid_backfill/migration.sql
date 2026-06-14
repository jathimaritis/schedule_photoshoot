-- Safety migration: ensure createdById exists on both tables and backfill any NULLs.
-- The columns should already exist if all prior migrations ran, but this guards against
-- partial deployments where earlier migrations were skipped.

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "ProductionCallSheet" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- Backfill any NULL createdById to the first admin in the same organisation.
-- For Project: join via organisationId to find the org's admin.
UPDATE "Project" p
SET "createdById" = (
  SELECT u.id FROM "User" u
  WHERE u."organisationId" = p."organisationId" AND u.role = 'ADMIN'
  LIMIT 1
)
WHERE p."createdById" IS NULL;

-- Fallback: any remaining NULLs (no admin in org) get the global first admin.
UPDATE "Project"
SET "createdById" = (SELECT id FROM "User" WHERE role = 'ADMIN' LIMIT 1)
WHERE "createdById" IS NULL;

UPDATE "ProductionCallSheet" pcs
SET "createdById" = (
  SELECT u.id FROM "User" u
  WHERE u."organisationId" = pcs."organisationId" AND u.role = 'ADMIN'
  LIMIT 1
)
WHERE pcs."createdById" IS NULL;

UPDATE "ProductionCallSheet"
SET "createdById" = (SELECT id FROM "User" WHERE role = 'ADMIN' LIMIT 1)
WHERE "createdById" IS NULL;
