import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import prisma from './utils/prisma';

import authRouter from './routes/auth';
import orgRouter from './routes/org';
import projectsRouter from './routes/projects';
import typesRouter from './routes/types';
import daysRouter from './routes/days';
import shotsRouter from './routes/shots';
import callSheetsRouter from './routes/callsheets';
import exportRouter from './routes/export';
import profileRouter from './routes/profile';
import productionCallSheetsRouter from './routes/production-callsheets';
import { errorHandler, notFound } from './middleware/error';

const app = express();
const PORT = parseInt(process.env.PORT || '3000');

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

app.use('/api', limiter);
app.use('/api/auth', authLimiter);

app.use('/api/auth', authRouter);
app.use('/api/org', orgRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/projects/:id/types', typesRouter);
app.use('/api/projects/:id/days', daysRouter);
app.use('/api/projects/:id/shots', shotsRouter);
app.use('/api/projects/:id/callsheets', callSheetsRouter);
app.use('/api/projects/:id/export', exportRouter);
app.use('/api/profile', profileRouter);
app.use('/api/production-callsheets', productionCallSheetsRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Serve frontend static build in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

async function applySchemaPatches() {
  const patches: [string, string][] = [
    ['ShootingDay.headerColour', `ALTER TABLE "ShootingDay" ADD COLUMN IF NOT EXISTS "headerColour" TEXT`],
    ['Shot.notes', `ALTER TABLE "Shot" ADD COLUMN IF NOT EXISTS "notes" TEXT`],
    ['ModuleAccess enum', `DO $$ BEGIN CREATE TYPE "ModuleAccess" AS ENUM ('NONE','SCHEDULER','CALL_SHEET','BOTH'); EXCEPTION WHEN duplicate_object THEN null; END $$`],
    ['User.moduleAccess', `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "moduleAccess" "ModuleAccess" NOT NULL DEFAULT 'NONE'`],
    ['User.moduleAccess owners', `UPDATE "User" SET "moduleAccess" = 'BOTH' WHERE "role" IN ('OWNER','ADMIN') AND "moduleAccess" = 'NONE'`],
    ['ProductionCallSheet table', `CREATE TABLE IF NOT EXISTS "ProductionCallSheet" ("id" TEXT NOT NULL,"projectName" TEXT NOT NULL,"client" TEXT,"location" TEXT,"shootingDate" TIMESTAMP(3),"generalNotes" TEXT,"sunrise" TEXT,"sunset" TEXT,"goldenHourAm" TEXT,"goldenHourPm" TEXT,"blueHourAm" TEXT,"blueHourPm" TEXT,"startOfDay" TEXT,"breakfastTime" TEXT,"lunchTime" TEXT,"dinnerTime" TEXT,"endOfDay" TEXT,"organisationId" TEXT NOT NULL,"createdById" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "ProductionCallSheet_pkey" PRIMARY KEY ("id"))`],
    ['ProductionShot table', `CREATE TABLE IF NOT EXISTS "ProductionShot" ("id" TEXT NOT NULL,"shootingLocation" TEXT,"description" TEXT NOT NULL,"timing" TEXT,"notes" TEXT,"status" "ShotStatus" NOT NULL DEFAULT 'PENDING',"sortOrder" INTEGER NOT NULL DEFAULT 0,"callSheetId" TEXT NOT NULL,CONSTRAINT "ProductionShot_pkey" PRIMARY KEY ("id"))`],
    ['ProductionCallSheet org fk', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ProductionCallSheet_organisationId_fkey') THEN ALTER TABLE "ProductionCallSheet" ADD CONSTRAINT "ProductionCallSheet_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$`],
    ['ProductionCallSheet user fk', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ProductionCallSheet_createdById_fkey') THEN ALTER TABLE "ProductionCallSheet" ADD CONSTRAINT "ProductionCallSheet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$`],
    ['ProductionShot cs fk', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ProductionShot_callSheetId_fkey') THEN ALTER TABLE "ProductionShot" ADD CONSTRAINT "ProductionShot_callSheetId_fkey" FOREIGN KEY ("callSheetId") REFERENCES "ProductionCallSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$`],
    ['ProductionCallSheet.contacts', `ALTER TABLE "ProductionCallSheet" ADD COLUMN IF NOT EXISTS "contacts" JSONB NOT NULL DEFAULT '[]'`],
    ['ProductionCallSheet.weatherData', `ALTER TABLE "ProductionCallSheet" ADD COLUMN IF NOT EXISTS "weatherData" JSONB`],
  ];

  for (const [name, sql] of patches) {
    await prisma.$executeRawUnsafe(sql).catch((e: Error) =>
      console.warn(`Schema patch [${name}] skipped:`, e.message)
    );
  }
}

async function start() {
  await applySchemaPatches();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV ?? 'development'} mode`);
  });
}

start();

export default app;
