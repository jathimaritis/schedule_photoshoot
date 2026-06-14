-- ============================================================
-- Rebuild user system for invite-only access
-- ============================================================

-- Step 1: Add new enum values needed for data migration
DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MEMBER'; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TYPE "ModuleAccess" ADD VALUE IF NOT EXISTS 'CALLSHEET'; EXCEPTION WHEN others THEN null; END $$;

-- Step 2: Migrate User data to new values before type change
UPDATE "User" SET "role" = 'ADMIN' WHERE "role"::text = 'OWNER';
UPDATE "User" SET "role" = 'MEMBER' WHERE "role"::text IN ('EDITOR', 'VIEWER');
UPDATE "User" SET "moduleAccess" = 'CALLSHEET' WHERE "moduleAccess"::text = 'CALL_SHEET';
UPDATE "User" SET "moduleAccess" = 'SCHEDULER' WHERE "moduleAccess"::text = 'NONE';

-- Step 3: Drop column defaults before type swap
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "moduleAccess" DROP DEFAULT;

-- Step 4: Create new slim Role enum
DO $$ BEGIN CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'MEMBER'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Step 5: Swap User.role to new type
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING "role"::text::"Role_new";

-- Step 6: Drop InviteToken.role (table should be empty; safe to drop)
ALTER TABLE "InviteToken" DROP COLUMN IF EXISTS "role";

-- Step 7: Drop old Role enum and rename new one
DROP TYPE IF EXISTS "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

-- Step 8: Create new slim ModuleAccess enum
DO $$ BEGIN CREATE TYPE "ModuleAccess_new" AS ENUM ('SCHEDULER', 'CALLSHEET', 'BOTH'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Step 9: Swap User.moduleAccess to new type
ALTER TABLE "User" ALTER COLUMN "moduleAccess" TYPE "ModuleAccess_new" USING "moduleAccess"::text::"ModuleAccess_new";

-- Step 10: Drop old ModuleAccess enum and rename new one
DROP TYPE IF EXISTS "ModuleAccess";
ALTER TYPE "ModuleAccess_new" RENAME TO "ModuleAccess";

-- Step 11: Restore column defaults with new types
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
ALTER TABLE "User" ALTER COLUMN "moduleAccess" SET DEFAULT 'SCHEDULER';

-- Step 12: Drop UserStatus columns and enum
ALTER TABLE "User" DROP COLUMN IF EXISTS "status";
ALTER TABLE "User" DROP COLUMN IF EXISTS "accessScheduler";
ALTER TABLE "User" DROP COLUMN IF EXISTS "accessCallSheet";
ALTER TABLE "User" DROP COLUMN IF EXISTS "isAdmin";
DROP TYPE IF EXISTS "UserStatus";

-- Step 13: Add moduleAccess column to InviteToken
ALTER TABLE "InviteToken" ADD COLUMN IF NOT EXISTS "moduleAccess" "ModuleAccess" NOT NULL DEFAULT 'SCHEDULER';

-- Step 14: Add Organisation FK to InviteToken if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InviteToken_organisationId_fkey'
  ) THEN
    ALTER TABLE "InviteToken" ADD CONSTRAINT "InviteToken_organisationId_fkey"
      FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Step 15: Add index on InviteToken.organisationId if missing
CREATE INDEX IF NOT EXISTS "InviteToken_organisationId_idx" ON "InviteToken"("organisationId");
