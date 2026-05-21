import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { FieldGroup } from '@prisma/client';
import prisma from '../utils/prisma';
import { authenticate, requireMinRole } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router({ mergeParams: true });
router.use(authenticate);

const DEFAULT_CREW_FIELDS = ['Producer', 'Photographer', 'Interior Stylist', "Photographer's Assistant", 'Videographer', 'Wardrobe', 'Hair & Make Up', 'Models'];
const DEFAULT_CLIENT_FIELDS = ["Client's Name", 'Creative Director', 'Project Manager', 'On Site Manager'];
const DEFAULT_LOGISTICS_FIELDS = ['Start of Day', 'Breakfast', 'Lunch', 'Dinner', 'End of Day'];

const updateCallSheetSchema = z.object({
  notes: z.string().optional().nullable(),
  isLocked: z.boolean().optional(),
});

const fieldsSchema = z.object({
  fields: z.array(z.object({
    id: z.string().optional(),
    label: z.string().min(1),
    value: z.string().optional().nullable(),
    isVisible: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    fieldGroup: z.enum(['CREW', 'CLIENT', 'LOGISTICS']),
  })),
});

const reorderShotsSchema = z.object({
  shots: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })),
});

async function getProject(projectId: string, organisationId: string) {
  return prisma.project.findFirst({ where: { id: projectId, organisationId } });
}

function buildDefaultFields(callSheetId: string) {
  const fields = [];
  let order = 0;
  for (const label of DEFAULT_CREW_FIELDS) {
    fields.push({ label, value: null, isVisible: true, sortOrder: order++, fieldGroup: 'CREW' as FieldGroup, callSheetId });
  }
  for (const label of DEFAULT_CLIENT_FIELDS) {
    fields.push({ label, value: null, isVisible: true, sortOrder: order++, fieldGroup: 'CLIENT' as FieldGroup, callSheetId });
  }
  for (const label of DEFAULT_LOGISTICS_FIELDS) {
    fields.push({ label, value: null, isVisible: true, sortOrder: order++, fieldGroup: 'LOGISTICS' as FieldGroup, callSheetId });
  }
  return fields;
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const callSheets = await prisma.callSheet.findMany({
    where: { projectId: project.id },
    include: { shootingDay: { include: { photographyType: true } } },
    orderBy: { shootingDay: { dayNumber: 'asc' } },
  });
  res.json(callSheets);
});

router.post('/generate', requireMinRole('EDITOR'), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const days = await prisma.shootingDay.findMany({ where: { projectId: project.id } });
  const created = [];

  for (const day of days) {
    const existing = await prisma.callSheet.findFirst({ where: { shootingDayId: day.id } });
    if (existing) continue;

    const org = await prisma.organisation.findUnique({ where: { id: project.organisationId } });
    const defaultFields = org?.defaultCrewFields
      ? (org.defaultCrewFields as { label: string }[]).map((f, i) => ({ label: f.label, value: null, isVisible: true, sortOrder: i, fieldGroup: 'CREW' as FieldGroup }))
      : [];

    const cs = await prisma.callSheet.create({
      data: {
        shootingDayId: day.id,
        projectId: project.id,
        fields: { create: buildDefaultFields('') },
      },
    });

    // Assign shots for this day to the call sheet
    const assignments = await prisma.shotDayAssignment.findMany({
      where: { shootingDayId: day.id },
      include: { shot: true },
    });
    if (assignments.length > 0) {
      await prisma.callSheetShot.createMany({
        data: assignments.map((a, i) => ({ callSheetId: cs.id, shotId: a.shotId, sortOrder: i })),
        skipDuplicates: true,
      });
    }
    created.push(cs);
  }

  res.json({ created: created.length });
});

router.get('/:dayId', async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const day = await prisma.shootingDay.findFirst({ where: { id: req.params.dayId, projectId: project.id } });
  if (!day) { res.status(404).json({ error: 'Shooting day not found' }); return; }

  let cs = await prisma.callSheet.findFirst({
    where: { shootingDayId: day.id },
    include: {
      fields: { orderBy: [{ fieldGroup: 'asc' }, { sortOrder: 'asc' }] },
      shots: {
        orderBy: { sortOrder: 'asc' },
        include: { shot: { include: { location: { include: { category: { include: { photographyType: true } } } } } } },
      },
      shootingDay: { include: { photographyType: true } },
    },
  });

  if (!cs) {
    cs = await prisma.callSheet.create({
      data: {
        shootingDayId: day.id,
        projectId: project.id,
        fields: { create: buildDefaultFields('') },
      },
      include: {
        fields: { orderBy: [{ fieldGroup: 'asc' }, { sortOrder: 'asc' }] },
        shots: { orderBy: { sortOrder: 'asc' }, include: { shot: { include: { location: { include: { category: { include: { photographyType: true } } } } } } } },
        shootingDay: { include: { photographyType: true } },
      },
    });
  }

  res.json(cs);
});

router.put('/:dayId', requireMinRole('EDITOR'), validate(updateCallSheetSchema), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const day = await prisma.shootingDay.findFirst({ where: { id: req.params.dayId, projectId: project.id } });
  if (!day) { res.status(404).json({ error: 'Shooting day not found' }); return; }

  const cs = await prisma.callSheet.findFirst({ where: { shootingDayId: day.id } });
  if (!cs) { res.status(404).json({ error: 'Call sheet not found' }); return; }

  const updated = await prisma.callSheet.update({ where: { id: cs.id }, data: req.body });
  res.json(updated);
});

router.put('/:dayId/fields', requireMinRole('EDITOR'), validate(fieldsSchema), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const day = await prisma.shootingDay.findFirst({ where: { id: req.params.dayId, projectId: project.id } });
  if (!day) { res.status(404).json({ error: 'Shooting day not found' }); return; }

  const cs = await prisma.callSheet.findFirst({ where: { shootingDayId: day.id } });
  if (!cs) { res.status(404).json({ error: 'Call sheet not found' }); return; }

  await prisma.callSheetField.deleteMany({ where: { callSheetId: cs.id } });
  await prisma.callSheetField.createMany({
    data: req.body.fields.map((f: z.infer<typeof fieldsSchema>['fields'][0]) => ({
      label: f.label,
      value: f.value ?? null,
      isVisible: f.isVisible ?? true,
      sortOrder: f.sortOrder ?? 0,
      fieldGroup: f.fieldGroup as FieldGroup,
      callSheetId: cs.id,
    })),
  });

  const updated = await prisma.callSheetField.findMany({
    where: { callSheetId: cs.id },
    orderBy: [{ fieldGroup: 'asc' }, { sortOrder: 'asc' }],
  });
  res.json(updated);
});

router.put('/:dayId/shots/reorder', requireMinRole('EDITOR'), validate(reorderShotsSchema), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const day = await prisma.shootingDay.findFirst({ where: { id: req.params.dayId, projectId: project.id } });
  if (!day) { res.status(404).json({ error: 'Shooting day not found' }); return; }

  const cs = await prisma.callSheet.findFirst({ where: { shootingDayId: day.id } });
  if (!cs) { res.status(404).json({ error: 'Call sheet not found' }); return; }

  await prisma.$transaction(
    req.body.shots.map((s: { id: string; sortOrder: number }) =>
      prisma.callSheetShot.update({ where: { id: s.id }, data: { sortOrder: s.sortOrder } })
    )
  );
  res.json({ message: 'Reordered' });
});

export default router;
