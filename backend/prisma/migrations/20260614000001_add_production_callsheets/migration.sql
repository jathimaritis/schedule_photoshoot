-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductionCallSheet" (
    "id" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "client" TEXT,
    "location" TEXT,
    "shootingDate" TIMESTAMP(3),
    "generalNotes" TEXT,
    "sunrise" TEXT,
    "sunset" TEXT,
    "goldenHourAm" TEXT,
    "goldenHourPm" TEXT,
    "blueHourAm" TEXT,
    "blueHourPm" TEXT,
    "startOfDay" TEXT,
    "breakfastTime" TEXT,
    "lunchTime" TEXT,
    "dinnerTime" TEXT,
    "endOfDay" TEXT,
    "organisationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionCallSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductionShot" (
    "id" TEXT NOT NULL,
    "shootingLocation" TEXT,
    "description" TEXT NOT NULL,
    "timing" TEXT,
    "notes" TEXT,
    "status" "ShotStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "callSheetId" TEXT NOT NULL,
    CONSTRAINT "ProductionShot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductionCallSheet_organisationId_idx" ON "ProductionCallSheet"("organisationId");
CREATE INDEX IF NOT EXISTS "ProductionCallSheet_createdById_idx" ON "ProductionCallSheet"("createdById");
CREATE INDEX IF NOT EXISTS "ProductionShot_callSheetId_idx" ON "ProductionShot"("callSheetId");

-- AddForeignKey (idempotent via DO block)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductionCallSheet_organisationId_fkey') THEN
    ALTER TABLE "ProductionCallSheet" ADD CONSTRAINT "ProductionCallSheet_organisationId_fkey"
      FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductionCallSheet_createdById_fkey') THEN
    ALTER TABLE "ProductionCallSheet" ADD CONSTRAINT "ProductionCallSheet_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductionShot_callSheetId_fkey') THEN
    ALTER TABLE "ProductionShot" ADD CONSTRAINT "ProductionShot_callSheetId_fkey"
      FOREIGN KEY ("callSheetId") REFERENCES "ProductionCallSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
