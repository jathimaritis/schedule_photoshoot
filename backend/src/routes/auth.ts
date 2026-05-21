import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import slugify from 'slugify';
import { Role } from '@prisma/client';
import prisma from '../utils/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { sendInviteEmail, sendPasswordResetEmail } from '../utils/email';
import { validate } from '../middleware/validate';
import { authenticate, requireMinRole } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  organisationName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']).default('VIEWER'),
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

router.post('/register', validate(registerSchema), async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, organisationName } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const baseSlug = slugify(organisationName, { lower: true, strict: true });
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.organisation.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter++}`;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const org = await prisma.organisation.create({
    data: { name: organisationName, slug },
  });

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: 'OWNER', organisationId: org.id },
  });

  const payload = { userId: user.id, email: user.email, role: user.role, organisationId: org.id };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });

  setRefreshCookie(res, refreshToken);
  res.status(201).json({ accessToken, user: { id: user.id, name, email, role: user.role, organisationId: org.id } });
});

router.post('/login', validate(loginSchema), async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email }, include: { organisation: true } });
  if (!user || !user.isActive) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const payload = { userId: user.id, email: user.email, role: user.role, organisationId: user.organisationId };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });

  setRefreshCookie(res, refreshToken);
  res.json({
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organisationId: user.organisationId,
      avatarUrl: user.avatarUrl,
      organisation: { id: user.organisation.id, name: user.organisation.name, slug: user.organisation.slug, logoUrl: user.organisation.logoUrl },
    },
  });
});

router.post('/logout', authenticate, async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.refreshToken;
  if (token) {
    await prisma.refreshToken.updateMany({ where: { token }, data: { revokedAt: new Date() } });
  }
  res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
  res.json({ message: 'Logged out' });
});

router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    res.status(401).json({ error: 'No refresh token' });
    return;
  }

  try {
    const stored = await prisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const payload = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    await prisma.refreshToken.update({ where: { token }, data: { revokedAt: new Date() } });

    const newPayload = { userId: user.id, email: user.email, role: user.role, organisationId: user.organisationId };
    const accessToken = signAccessToken(newPayload);
    const refreshToken = signRefreshToken(newPayload);

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });

    setRefreshCookie(res, refreshToken);
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.post('/invite', authenticate, requireMinRole('ADMIN'), validate(inviteSchema), async (req: Request, res: Response): Promise<void> => {
  const { email, role } = req.body;
  const { organisationId, userId } = req.user!;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'User already exists' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.inviteToken.create({
    data: { token, email, role: role as Role, expiresAt, createdById: userId, organisationId },
  });

  const org = await prisma.organisation.findUnique({ where: { id: organisationId } });
  const inviteUrl = `${process.env.CLIENT_URL}/accept-invite/${token}`;
  await sendInviteEmail(email, inviteUrl, org!.name);

  res.json({ message: 'Invite sent', email });
});

router.post('/accept-invite/:token', validate(acceptInviteSchema), async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params;
  const { name, password } = req.body;

  const invite = await prisma.inviteToken.findUnique({ where: { token } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    res.status(400).json({ error: 'Invalid or expired invite token' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  if (existing) {
    res.status(409).json({ error: 'User already exists' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email: invite.email, passwordHash, role: invite.role, organisationId: invite.organisationId },
  });

  await prisma.inviteToken.update({ where: { token }, data: { usedAt: new Date() } });

  const payload = { userId: user.id, email: user.email, role: user.role, organisationId: user.organisationId };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });

  setRefreshCookie(res, refreshToken);
  res.status(201).json({ accessToken, user: { id: user.id, name, email: user.email, role: user.role, organisationId: user.organisationId } });
});

router.post('/forgot-password', validate(forgotPasswordSchema), async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  // Always return 200 to avoid email enumeration
  if (!user) {
    res.json({ message: 'If that email exists, a reset link has been sent' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.passwordReset.create({ data: { token, userId: user.id, expiresAt } });

  const resetUrl = `${process.env.CLIENT_URL}/reset-password/${token}`;
  await sendPasswordResetEmail(email, resetUrl);

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
