import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import prisma from '../utils/prisma';
import { authenticate, requireMinRole } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate);

const updateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  agencyName: z.string().optional(),
  footerText: z.string().optional(),
  logoUrl: z.string().optional().nullable(),
  defaultCrewFields: z.array(z.object({ label: z.string(), value: z.string().optional() })).optional(),
  defaultClientFields: z.array(z.object({ label: z.string(), value: z.string().optional() })).optional(),
  defaultLogisticsFields: z.array(z.object({ label: z.string(), value: z.string().optional() })).optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']),
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const org = await prisma.organisation.findUnique({ where: { id: req.user!.organisationId } });
  res.json(org);
});

router.put('/', requireMinRole('ADMIN'), validate(updateOrgSchema), async (req: Request, res: Response): Promise<void> => {
  const org = await prisma.organisation.update({
    where: { id: req.user!.organisationId },
    data: req.body,
  });
  res.json(org);
});

router.get('/users', requireMinRole('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const users = await prisma.user.findMany({
    where: { organisationId: req.user!.organisationId },
    select: { id: true, name: true, email: true, role: true, avatarUrl: true, isActive: true, createdAt: true, lastLoginAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const pendingInvites = await prisma.inviteToken.findMany({
    where: { organisationId: req.user!.organisationId, usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
  });

  res.json({ users, pendingInvites });
});

router.put('/users/:userId/role', requireMinRole('OWNER'), validate(updateRoleSchema), async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;
  const { role } = req.body;

  const target = await prisma.user.findFirst({ where: { id: userId, organisationId: req.user!.organisationId } });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (target.id === req.user!.userId) {
    res.status(400).json({ error: 'Cannot change your own role' });
    return;
  }

  const updated = await prisma.user.update({ where: { id: userId }, data: { role: role as Role } });
  res.json({ id: updated.id, role: updated.role });
});

router.delete('/users/:userId', requireMinRole('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;

  if (userId === req.user!.userId) {
    res.status(400).json({ error: 'Cannot remove yourself' });
    return;
  }

  const target = await prisma.user.findFirst({ where: { id: userId, organisationId: req.user!.organisationId } });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
  res.json({ message: 'User deactivated' });
});

router.delete('/invites/:inviteId', requireMinRole('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const invite = await prisma.inviteToken.findFirst({
    where: { id: req.params.inviteId, organisationId: req.user!.organisationId },
  });
  if (!invite) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }
  await prisma.inviteToken.delete({ where: { id: req.params.inviteId } });
  res.json({ message: 'Invite revoked' });
});

export default router;
