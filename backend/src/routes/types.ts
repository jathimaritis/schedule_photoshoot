import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { authenticate, requireMinRole, requireApproved } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router({ mergeParams: true });
router.use(authenticate);
router.use(requireApproved);

const typeSchema = z.object({
  name: z.string().min(1),
  hexColour: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  sortOrder: z.number().int().optional(),
});

async function getProject(projectId: string, organisationId: string) {
  return prisma.project.findFirst({ where: { id: projectId, organisationId } });
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const types = await prisma.photographyType.findMany({ where: { projectId: project.id }, orderBy: { sortOrder: 'asc' } });
  res.json(types);
});

router.post('/', requireMinRole('EDITOR'), validate(typeSchema), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const type = await prisma.photographyType.create({ data: { ...req.body, projectId: project.id } });
  res.status(201).json(type);
});

router.put('/:typeId', requireMinRole('EDITOR'), validate(typeSchema.partial()), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const type = await prisma.photographyType.findFirst({ where: { id: req.params.typeId, projectId: project.id } });
  if (!type) { res.status(404).json({ error: 'Type not found' }); return; }
  const updated = await prisma.photographyType.update({ where: { id: type.id }, data: req.body });
  res.json(updated);
});

router.delete('/:typeId', requireMinRole('EDITOR'), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const type = await prisma.photographyType.findFirst({ where: { id: req.params.typeId, projectId: project.id } });
  if (!type) { res.status(404).json({ error: 'Type not found' }); return; }
  await prisma.photographyType.delete({ where: { id: type.id } });
  res.json({ message: 'Deleted' });
});

export default router;
