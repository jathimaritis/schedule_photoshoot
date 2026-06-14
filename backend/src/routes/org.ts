import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ModuleAccess } from '@prisma/client';
import prisma from '../utils/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';
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

const updateModuleAccessSchema = z.object({
  moduleAccess: z.enum(['SCHEDULER', 'CALLSHEET', 'BOTH']),
});

const updateActiveSchema = z.object({
  isActive: z.boolean(),
});

// ─── Org ─────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const org = await prisma.organisation.findUnique({ where: { id: req.user!.organisationId } });
  res.json(org);
});

router.put('/', requireAdmin, validate(updateOrgSchema), async (req: Request, res: Response): Promise<void> => {
  const org = await prisma.organisation.update({
    where: { id: req.user!.organisationId },
    data: req.body,
  });
  res.json(org);
});

// ─── Users ───────────────────────────────────────────────────────────────────

router.get('/users', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const users = await prisma.user.findMany({
    where: { organisationId: req.user!.organisationId },
    select: {
      id: true, name: true, email: true, role: true, moduleAccess: true,
      isActive: true, createdAt: true, lastLoginAt: true, avatarUrl: true,
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });

  const invites = await prisma.inviteToken.findMany({
    where: { organisationId: req.user!.organisationId },
    select: { id: true, email: true, token: true, moduleAccess: true, createdAt: true, expiresAt: true, usedAt: true },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ users, invites });
});

// Update moduleAccess
router.put('/users/:userId/module-access', requireAdmin, validate(updateModuleAccessSchema), async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;

  if (userId === req.user!.userId) { res.status(400).json({ error: 'Cannot change your own access' }); return; }

  const target = await prisma.user.findFirst({ where: { id: userId, organisationId: req.user!.organisationId } });
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }
  if (target.role === 'ADMIN') { res.status(400).json({ error: 'Cannot change admin access' }); return; }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { moduleAccess: req.body.moduleAccess as ModuleAccess },
    select: { id: true, moduleAccess: true },
  });
  res.json(updated);
});

// Toggle active status (deactivate / reactivate)
router.put('/users/:userId/active', requireAdmin, validate(updateActiveSchema), async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;

  if (userId === req.user!.userId) { res.status(400).json({ error: 'Cannot deactivate your own account' }); return; }

  const target = await prisma.user.findFirst({ where: { id: userId, organisationId: req.user!.organisationId } });
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }
  if (target.role === 'ADMIN') { res.status(400).json({ error: 'Cannot deactivate an admin account' }); return; }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: req.body.isActive },
    select: { id: true, isActive: true },
  });
  res.json(updated);
});

// Delete user permanently
router.delete('/users/:userId', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;

  if (userId === req.user!.userId) { res.status(400).json({ error: 'Cannot delete your own account' }); return; }

  const target = await prisma.user.findFirst({ where: { id: userId, organisationId: req.user!.organisationId } });
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }
  if (target.role === 'ADMIN') { res.status(400).json({ error: 'Cannot delete an admin account' }); return; }

  await prisma.$transaction([
    prisma.productionCallSheet.deleteMany({ where: { createdById: userId } }),
    prisma.project.deleteMany({ where: { createdById: userId } }),
    prisma.inviteToken.deleteMany({ where: { createdById: userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
  res.json({ message: 'User deleted' });
});

// Cancel/revoke an invite
router.delete('/invites/:inviteId', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const invite = await prisma.inviteToken.findFirst({
    where: { id: req.params.inviteId, organisationId: req.user!.organisationId },
  });
  if (!invite) { res.status(404).json({ error: 'Invite not found' }); return; }
  await prisma.inviteToken.delete({ where: { id: req.params.inviteId } });
  res.json({ message: 'Invite cancelled' });
});

export default router;
