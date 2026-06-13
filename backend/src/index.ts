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

async function start() {
  // Apply any schema additions that the migration system may not have applied.
  // Using IF NOT EXISTS makes this safe to run on every startup.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ShootingDay" ADD COLUMN IF NOT EXISTS "headerColour" TEXT`
  ).catch((e) => console.warn('Schema check warning:', e.message));

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Shot" ADD COLUMN IF NOT EXISTS "notes" TEXT`
  ).catch((e) => console.warn('Schema check warning:', e.message));

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV ?? 'development'} mode`);
  });
}

start();

export default app;
