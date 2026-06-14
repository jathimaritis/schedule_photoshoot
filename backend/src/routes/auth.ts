import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ModuleAccess } from '@prisma/client';
import prisma from '../utils/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { sendPasswordResetEmail } from '../utils/email';
import { validate } from '../middleware/validate';
import { authenticate, requireAdmin } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const inviteSchema = z.object({
  email: z.string().email(),
  moduleAccess: z.enum(['SCHEDULER', 'CALLSHEET', 'BOTH']),
});

const acceptInviteSchema = z.object({
  name: z.string().min(1),
  password: z.string().min(8),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8),
});

function setRefreshCookie(res: Response, token: string): void {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth/refresh',
  });
}

function buildPayload(user: { id: string; email: string; role: string; moduleAccess: string; organisationId: string }) {
  return {
    userId: user.id,
    email: user.email,
    role: user.role as import('@prisma/client').Role,
    moduleAccess: user.moduleAccess as ModuleAccess,
    organisationId: user.organisationId,
  };
}

// ─── Login ───────────────────────────────────────────────────────────────────

router.post('/login', validate(loginSchema), async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email }, include: { organisation: true } });
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  if (!user.isActive) {
    res.status(401).json({ error: 'Your account has been deactivated. Please contact the administrator.', code: 'DEACTIVATED' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const payload = buildPayload(user);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });

  setRefreshCookie(res, refreshToken);
  res.json({
    accessToken,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      moduleAccess: user.moduleAccess, organisationId: user.organisationId,
      avatarUrl: user.avatarUrl, isActive: user.isActive,
      organisation: { id: user.organisation.id, name: user.organisation.name, slug: user.organisation.slug, logoUrl: user.organisation.logoUrl },
    },
  });
});

// ─── Logout ──────────────────────────────────────────────────────────────────

router.post('/logout', authenticate, async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.refreshToken;
  if (token) {
    await prisma.refreshToken.updateMany({ where: { token }, data: { revokedAt: new Date() } });
  }
  res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
  res.json({ message: 'Logged out' });
});

// ─── Refresh ─────────────────────────────────────────────────────────────────

router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.refreshToken;
  if (!token) { res.status(401).json({ error: 'No refresh token' }); return; }

  try {
    const stored = await prisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const parsed = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({ where: { id: parsed.userId } });
    if (!user) { res.status(401).json({ error: 'Account not found', code: 'DEACTIVATED' }); return; }
    if (!user.isActive) { res.status(401).json({ error: 'Account deactivated', code: 'DEACTIVATED' }); return; }

    await prisma.refreshToken.update({ where: { token }, data: { revokedAt: new Date() } });

    const payload = buildPayload(user);
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });

    setRefreshCookie(res, refreshToken);
    res.json({
      accessToken,
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role,
        moduleAccess: user.moduleAccess, organisationId: user.organisationId,
        avatarUrl: user.avatarUrl, isActive: user.isActive,
      },
    });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ─── Invite (admin only) ─────────────────────────────────────────────────────

router.post('/invite', authenticate, requireAdmin, validate(inviteSchema), async (req: Request, res: Response): Promise<void> => {
  const { email, moduleAccess } = req.body as { email: string; moduleAccess: ModuleAccess };
  const { organisationId, userId } = req.user!;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.inviteToken.create({
    data: { token, email, moduleAccess, expiresAt, createdById: userId, organisationId },
  });

  const inviteUrl = `${process.env.CLIENT_URL}/invite/${token}`;

  res.json({ message: 'Invite created', email, inviteUrl });
});

// ─── Look up invite (public) ──────────────────────────────────────────────────

router.get('/invite/:token', async (req: Request, res: Response): Promise<void> => {
  const invite = await prisma.inviteToken.findUnique({ where: { token: req.params.token } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    res.status(400).json({ error: 'This invitation is no longer valid.' });
    return;
  }
  res.json({ email: invite.email, moduleAccess: invite.moduleAccess });
});

// ─── Accept invite ───────────────────────────────────────────────────────────

router.post('/invite/:token', validate(acceptInviteSchema), async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params;
  const { name, password } = req.body;

  const invite = await prisma.inviteToken.findUnique({ where: { token } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    res.status(400).json({ error: 'This invitation is no longer valid.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name,
      email: invite.email,
      passwordHash,
      role: 'MEMBER',
      moduleAccess: invite.moduleAccess,
      organisationId: invite.organisationId,
    },
  });

  await prisma.inviteToken.update({ where: { token }, data: { usedAt: new Date() } });

  const payload = buildPayload(user);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });

  setRefreshCookie(res, refreshToken);

  const org = await prisma.organisation.findUnique({ where: { id: user.organisationId } });

  res.status(201).json({
    accessToken,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      moduleAccess: user.moduleAccess, organisationId: user.organisationId,
      avatarUrl: user.avatarUrl, isActive: user.isActive,
      organisation: org ? { id: org.id, name: org.name, slug: org.slug, logoUrl: org.logoUrl } : undefined,
    },
  });
});

// ─── Password reset ──────────────────────────────────────────────────────────

router.post('/forgot-password', validate(forgotPasswordSchema), async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    res.json({ message: 'If that email exists, a reset link has been sent' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.passwordReset.create({ data: { token, userId: user.id, expiresAt } });

  const resetUrl = `${process.env.CLIENT_URL}/reset-password/${token}`;
  await sendPasswordResetEmail(email, resetUrl).catch((err) => console.error('[reset] Email failed:', err));

  res.json({ message: 'If that email exists, a reset link has been sent' });
});

router.post('/reset-password/:token', validate(resetPasswordSchema), async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params;
  const { password } = req.body;

  const reset = await prisma.passwordReset.findUnique({ where: { token } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    res.status(400).json({ error: 'Invalid or expired reset token' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } });
  await prisma.passwordReset.update({ where: { token }, data: { usedAt: new Date() } });
  await prisma.refreshToken.updateMany({ where: { userId: reset.userId }, data: { revokedAt: new Date() } });

  res.json({ message: 'Password reset successfully' });
});

export default router;
