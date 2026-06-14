-- Create ModuleAccess enum
DO $$ BEGIN
  CREATE TYPE "ModuleAccess" AS ENUM ('NONE', 'SCHEDULER', 'CALL_SHEET', 'BOTH');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add moduleAccess column to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "moduleAccess" "ModuleAccess" NOT NULL DEFAULT 'NONE';

-- Grant all existing users (pre-feature) full access so nobody is locked out
UPDATE "User" SET "moduleAccess" = 'BOTH' WHERE "moduleAccess" = 'NONE';
