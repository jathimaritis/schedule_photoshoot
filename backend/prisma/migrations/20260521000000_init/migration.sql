-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ShotStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "FieldGroup" AS ENUM ('CREW', 'CLIENT', 'LOGISTICS');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "agencyName" TEXT,
    "footerText" TEXT,
    "defaultCrewFields" JSONB,
    "defaultClientFields" JSONB,
    "defaultLogisticsFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    "organisationId" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,

    CONSTRAINT "InviteToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT,
    "location" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "agencyName" TEXT,
    "footerText" TEXT,
    "organisationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotographyType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hexColour" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "PhotographyType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShootingDay" (
    "id" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "calendarDate" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "projectId" TEXT NOT NULL,
    "photographyTypeId" TEXT,

    CONSTRAINT "ShootingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShotSection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "ShotSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShotCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "sectionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "photographyTypeId" TEXT,

    CONSTRAINT "ShotCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShotLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "ShotLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shot" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "timing" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "status" "ShotStatus" NOT NULL DEFAULT 'PENDING',
    "tickColourOverride" TEXT,
    "locationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShotDayAssignment" (
    "id" TEXT NOT NULL,
    "shotId" TEXT NOT NULL,
    "shootingDayId" TEXT NOT NULL,
    "tickColour" TEXT,

    CONSTRAINT "ShotDayAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallSheet" (
    "id" TEXT NOT NULL,
    "notes" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "shootingDayId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallSheetField" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "fieldGroup" "FieldGroup" NOT NULL,
    "callSheetId" TEXT NOT NULL,

    CONSTRAINT "CallSheetField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallSheetShot" (
    "id" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "statusOverride" "ShotStatus",
    "callSheetId" TEXT NOT NULL,
    "shotId" TEXT NOT NULL,

    CONSTRAINT "CallSheetShot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_slug_key" ON "Organisation"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organisationId_idx" ON "User"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "InviteToken_token_key" ON "InviteToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_token_key" ON "PasswordReset"("token");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "Project_organisationId_idx" ON "Project"("organisationId");

-- CreateIndex
CREATE INDEX "PhotographyType_projectId_idx" ON "PhotographyType"("projectId");

-- CreateIndex
CREATE INDEX "ShootingDay_projectId_idx" ON "ShootingDay"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ShootingDay_projectId_dayNumber_key" ON "ShootingDay"("projectId", "dayNumber");

-- CreateIndex
CREATE INDEX "ShotSection_projectId_idx" ON "ShotSection"("projectId");

-- CreateIndex
CREATE INDEX "ShotCategory_sectionId_idx" ON "ShotCategory"("sectionId");

-- CreateIndex
CREATE INDEX "ShotCategory_projectId_idx" ON "ShotCategory"("projectId");

-- CreateIndex
CREATE INDEX "ShotLocation_categoryId_idx" ON "ShotLocation"("categoryId");

-- CreateIndex
CREATE INDEX "ShotLocation_projectId_idx" ON "ShotLocation"("projectId");

-- CreateIndex
CREATE INDEX "Shot_locationId_idx" ON "Shot"("locationId");

-- CreateIndex
CREATE INDEX "Shot_projectId_idx" ON "Shot"("projectId");

-- CreateIndex
CREATE INDEX "ShotDayAssignment_shotId_idx" ON "ShotDayAssignment"("shotId");

-- CreateIndex
CREATE INDEX "ShotDayAssignment_shootingDayId_idx" ON "ShotDayAssignment"("shootingDayId");

-- CreateIndex
CREATE UNIQUE INDEX "ShotDayAssignment_shotId_shootingDayId_key" ON "ShotDayAssignment"("shotId", "shootingDayId");

-- CreateIndex
CREATE UNIQUE INDEX "CallSheet_shootingDayId_key" ON "CallSheet"("shootingDayId");

-- CreateIndex
CREATE INDEX "CallSheet_projectId_idx" ON "CallSheet"("projectId");

-- CreateIndex
CREATE INDEX "CallSheetField_callSheetId_idx" ON "CallSheetField"("callSheetId");

-- CreateIndex
CREATE INDEX "CallSheetShot_callSheetId_idx" ON "CallSheetShot"("callSheetId");

-- CreateIndex
CREATE UNIQUE INDEX "CallSheetShot_callSheetId_shotId_key" ON "CallSheetShot"("callSheetId", "shotId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteToken" ADD CONSTRAINT "InviteToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotographyType" ADD CONSTRAINT "PhotographyType_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShootingDay" ADD CONSTRAINT "ShootingDay_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShootingDay" ADD CONSTRAINT "ShootingDay_photographyTypeId_fkey" FOREIGN KEY ("photographyTypeId") REFERENCES "PhotographyType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShotSection" ADD CONSTRAINT "ShotSection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShotCategory" ADD CONSTRAINT "ShotCategory_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ShotSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShotCategory" ADD CONSTRAINT "ShotCategory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShotCategory" ADD CONSTRAINT "ShotCategory_photographyTypeId_fkey" FOREIGN KEY ("photographyTypeId") REFERENCES "PhotographyType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShotLocation" ADD CONSTRAINT "ShotLocation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ShotCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShotLocation" ADD CONSTRAINT "ShotLocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shot" ADD CONSTRAINT "Shot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ShotLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shot" ADD CONSTRAINT "Shot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShotDayAssignment" ADD CONSTRAINT "ShotDayAssignment_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShotDayAssignment" ADD CONSTRAINT "ShotDayAssignment_shootingDayId_fkey" FOREIGN KEY ("shootingDayId") REFERENCES "ShootingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSheet" ADD CONSTRAINT "CallSheet_shootingDayId_fkey" FOREIGN KEY ("shootingDayId") REFERENCES "ShootingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSheet" ADD CONSTRAINT "CallSheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSheetField" ADD CONSTRAINT "CallSheetField_callSheetId_fkey" FOREIGN KEY ("callSheetId") REFERENCES "CallSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSheetShot" ADD CONSTRAINT "CallSheetShot_callSheetId_fkey" FOREIGN KEY ("callSheetId") REFERENCES "CallSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSheetShot" ADD CONSTRAINT "CallSheetShot_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

