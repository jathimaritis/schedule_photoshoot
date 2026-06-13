import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { authenticate, requireMinRole } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router({ mergeParams: true });
router.use(authenticate);

const daySchema = z.object({
  dayNumber: z.number().int().min(1),
  calendarDate: z.string().datetime(),
  label: z.string().optional().nullable(),
  headerColour: z.string().optional().nullable(),
  photographyTypeId: z.string().optional().nullable(),
});

const bulkDaySchema = z.object({
  days: z.array(daySchema),
});

async function getProject(projectId: string, organisationId: string) {
  return prisma.project.findFirst({ where: { id: projectId, organisationId } });
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const days = await prisma.shootingDay.findMany({
    where: { projectId: project.id },
    orderBy: { dayNumber: 'asc' },
    include: { photographyType: true, callSheet: { select: { id: true, isLocked: true } } },
  });
  res.json(days);
});

router.post('/', requireMinRole('EDITOR'), validate(daySchema), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const day = await prisma.shootingDay.create({ data: { ...req.body, projectId: project.id } });
  res.status(201).json(day);
});

router.post('/bulk', requireMinRole('EDITOR'), validate(bulkDaySchema), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  await prisma.shootingDay.deleteMany({ where: { projectId: project.id } });
  const days = await prisma.$transaction(
    req.body.days.map((d: z.infer<typeof daySchema>) =>
      prisma.shootingDay.create({ data: { ...d, projectId: project.id } })
    )
  );
  res.status(201).json(days);
});

router.put('/:dayId', requireMinRole('EDITOR'), validate(daySchema.partial()), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const day = await prisma.shootingDay.findFirst({ where: { id: req.params.dayId, projectId: project.id } });
  if (!day) { res.status(404).json({ error: 'Day not found' }); return; }
  const updated = await prisma.shootingDay.update({ where: { id: day.id }, data: req.body });
  res.json(updated);
});

router.delete('/:dayId', requireMinRole('EDITOR'), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const day = await prisma.shootingDay.findFirst({ where: { id: req.params.dayId, projectId: project.id } });
  if (!day) { res.status(404).json({ error: 'Day not found' }); return; }
  await prisma.shootingDay.delete({ where: { id: day.id } });
  res.json({ message: 'Deleted' });
});

export default router;
