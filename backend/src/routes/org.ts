import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Role, ModuleAccess } from '@prisma/client';
import prisma from '../utils/prisma';
import { authenticate, requireMinRole, requireApproved, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { UserStatus } from '../types';

const router = Router();
router.use(authenticate);
router.use(requireApproved);

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

const updateAccessSchema = z.object({
  moduleAccess: z.enum(['NONE', 'SCHEDULER', 'CALL_SHEET', 'BOTH']),
});

const updateStatusSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'RESTRICTED']),
});

const updateAccessFlagsSchema = z.object({
  accessScheduler: z.boolean().optional(),
  accessCallSheet: z.boolean().optional(),
});

// ─── Org ─────────────────────────────────────────────────────────────────────

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

// ─── Users (admin-only) ───────────────────────────────────────────────────────

router.get('/users', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const users = await prisma.user.findMany({
    where: { organisationId: req.user!.organisationId },
    select: {
      id: true, name: true, email: true, role: true, moduleAccess: true,
      status: true, accessScheduler: true, accessCallSheet: true, isAdmin: true,
      avatarUrl: true, isActive: true, createdAt: true, lastLoginAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const pendingInvites = await prisma.inviteToken.findMany({
    where: { organisationId: req.user!.organisationId, usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
  });

  res.json({ users, pendingInvites });
});

// Update status (approve / restrict / set pending)
router.put('/users/:userId/status', requireAdmin, validate(updateStatusSchema), async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;
  const { status } = req.body;

  if (userId === req.user!.userId) {
    res.status(400).json({ error: 'Cannot change your own status' });
    return;
  }

  const target = await prisma.user.findFirst({ where: { id: userId, organisationId: req.user!.organisationId } });
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }
  if (target.isAdmin) { res.status(400).json({ error: 'Cannot change status of another admin' }); return; }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { status: status as UserStatus },
    select: { id: true, status: true, accessScheduler: true, accessCallSheet: true },
  });
  res.json(updated);
});

// Toggle individual access flags
router.put('/users/:userId/access-flags', requireAdmin, validate(updateAccessFlagsSchema), async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;
  const { accessScheduler, accessCallSheet } = req.body as { accessScheduler?: boolean; accessCallSheet?: boolean };

  if (userId === req.user!.userId) {
    res.status(400).json({ error: 'Cannot change your own access' });
    return;
  }

  const target = await prisma.user.findFirst({ where: { id: userId, organisationId: req.user!.organisationId } });
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }
  if (target.isAdmin) { res.status(400).json({ error: 'Cannot change access of another admin' }); return; }

  const data: { accessScheduler?: boolean; accessCallSheet?: boolean } = {};
  if (accessScheduler !== undefined) data.accessScheduler = accessScheduler;
  if (accessCallSheet !== undefined) data.accessCallSheet = accessCallSheet;

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, status: true, accessScheduler: true, accessCallSheet: true },
  });
  res.json(updated);
});

// Legacy: update moduleAccess (kept for backward compat)
router.put('/users/:userId/access', requireAdmin, validate(updateAccessSchema), async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;
  const { moduleAccess } = req.body;

  const target = await prisma.user.findFirst({ where: { id: userId, organisationId: req.user!.organisationId } });
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }
  if (target.isAdmin) { res.status(400).json({ error: 'Cannot change admin access' }); return; }

  // Sync new flags from legacy moduleAccess value
  const accessScheduler = moduleAccess === 'SCHEDULER' || moduleAccess === 'BOTH';
  const accessCallSheet = moduleAccess === 'CALL_SHEET' || moduleAccess === 'BOTH';
  const status: UserStatus = moduleAccess === 'NONE' ? 'PENDING' : 'APPROVED';

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { moduleAccess: moduleAccess as ModuleAccess, accessScheduler, accessCallSheet, status },
  });
  res.json({ id: updated.id, moduleAccess: updated.moduleAccess, accessScheduler, accessCallSheet, status });
});

router.put('/users/:userId/role', requireMinRole('OWNER'), validate(updateRoleSchema), async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;
  const { role } = req.body;

  const target = await prisma.user.findFirst({ where: { id: userId, organisationId: req.user!.organisationId } });
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }
  if (target.id === req.user!.userId) { res.status(400).json({ error: 'Cannot change your own role' }); return; }

  const updated = await prisma.user.update({ where: { id: userId }, data: { role: role as Role } });
  res.json({ id: updated.id, role: updated.role });
});

router.delete('/users/:userId', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;

  if (userId === req.user!.userId) { res.status(400).json({ error: 'Cannot remove yourself' }); return; }

  const target = await prisma.user.findFirst({ where: { id: userId, organisationId: req.user!.organisationId } });
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }
  if (target.isAdmin) { res.status(400).json({ error: 'Cannot delete an admin account' }); return; }

  await prisma.user.delete({ where: { id: userId } });
  res.json({ message: 'User deleted' });
});

router.delete('/invites/:inviteId', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const invite = await prisma.inviteToken.findFirst({
    where: { id: req.params.inviteId, organisationId: req.user!.organisationId },
  });
  if (!invite) { res.status(404).json({ error: 'Invite not found' }); return; }
  await prisma.inviteToken.delete({ where: { id: req.params.inviteId } });
  res.json({ message: 'Invite revoked' });
});

export default router;
