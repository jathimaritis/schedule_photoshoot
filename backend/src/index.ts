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

if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

async function ensureAdminEmail() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!adminEmail) {
    console.warn('[startup] ADMIN_EMAIL is not set — no admin account will be promoted automatically');
    return;
  }
  try {
    const user = await prisma.user.findFirst({ where: { email: { equals: adminEmail, mode: 'insensitive' } } });
    if (!user) {
      console.warn(`[startup] ADMIN_EMAIL "${adminEmail}" does not match any user`);
      return;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN', isActive: true },
    });
    console.log(`[startup] Confirmed admin role for ${adminEmail}`);
  } catch (e: unknown) {
    console.warn('[startup] ensureAdminEmail failed:', (e as Error).message);
  }
}

async function start() {
  await ensureAdminEmail();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV ?? 'development'} mode`);
  });
}

start();

export default app;
