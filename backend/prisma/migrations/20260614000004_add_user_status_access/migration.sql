-- Create UserStatus enum
DO $$ BEGIN
  CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'APPROVED', 'RESTRICTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add new columns to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" "UserStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accessScheduler" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accessCallSheet" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Approve existing users who already had module access or admin roles
UPDATE "User" SET "status" = 'APPROVED'
  WHERE ("role"::text IN ('OWNER', 'ADMIN') OR "moduleAccess"::text != 'NONE')
    AND "status"::text = 'PENDING';

-- Grant scheduler access to users who had it
UPDATE "User" SET "accessScheduler" = true
  WHERE "moduleAccess"::text IN ('SCHEDULER', 'BOTH') OR "role"::text IN ('OWNER', 'ADMIN');

-- Grant call sheet access to users who had it
UPDATE "User" SET "accessCallSheet" = true
  WHERE "moduleAccess"::text IN ('CALL_SHEET', 'BOTH') OR "role"::text IN ('OWNER', 'ADMIN');

-- Set isAdmin for existing owners
UPDATE "User" SET "isAdmin" = true WHERE "role"::text = 'OWNER';
