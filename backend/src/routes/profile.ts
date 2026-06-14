import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { authenticate, requireApproved } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate);
router.use(requireApproved);

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, name: true, email: true, role: true, moduleAccess: true, avatarUrl: true, createdAt: true, lastLoginAt: true, organisationId: true },
  });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
});

router.put('/', validate(updateProfileSchema), async (req: Request, res: Response): Promise<void> => {
  if (req.body.email) {
    const existing = await prisma.user.findFirst({ where: { email: req.body.email, id: { not: req.user!.userId } } });
    if (existing) { res.status(409).json({ error: 'Email already in use' }); return; }
  }
  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data: req.body,
    select: { id: true, name: true, email: true, role: true, avatarUrl: true },
  });
  res.json(user);
});

router.put('/password', validate(changePasswordSchema), async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const valid = await bcrypt.compare(req.body.currentPassword, user.passwordHash);
  if (!valid) { res.status(400).json({ error: 'Current password is incorrect' }); return; }

  const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ message: 'Password updated' });
});

export default router;
