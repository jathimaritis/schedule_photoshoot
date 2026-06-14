import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ProjectStatus } from '@prisma/client';
import prisma from '../utils/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate);

const projectSchema = z.object({
  name: z.string().min(1),
  clientName: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
  agencyName: z.string().optional().nullable(),
  footerText: z.string().optional().nullable(),
});

const updateProjectSchema = projectSchema.partial();

function orgScope(req: Request) {
  return { organisationId: req.user!.organisationId };
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { status } = req.query;
  const where: Record<string, unknown> = { ...orgScope(req) };
  if (status) where.status = status as ProjectStatus;
  if (req.user!.role === 'MEMBER') where.createdById = req.user!.userId;

  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { shootingDays: true, shots: true } },
    },
  });
  res.json(projects);
});

router.post('/',  validate(projectSchema), async (req: Request, res: Response): Promise<void> => {
  const project = await prisma.project.create({
    data: { ...req.body, ...orgScope(req), createdById: req.user!.userId },
  });
  res.status(201).json(project);
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, ...orgScope(req) },
    include: {
      createdBy: { select: { id: true, name: true, avatarUrl: true } },
      photographyTypes: { orderBy: { sortOrder: 'asc' } },
      shootingDays: { orderBy: { dayNumber: 'asc' }, include: { photographyType: true } },
      _count: { select: { shots: true, callSheets: true } },
    },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
});

router.put('/:id',  validate(updateProjectSchema), async (req: Request, res: Response): Promise<void> => {
  const project = await prisma.project.findFirst({ where: { id: req.params.id, ...orgScope(req) } });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const updated = await prisma.project.update({ where: { id: req.params.id }, data: req.body });
  res.json(updated);
});

router.delete('/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const project = await prisma.project.findFirst({ where: { id: req.params.id, ...orgScope(req) } });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  await prisma.project.delete({ where: { id: req.params.id } });
  res.json({ message: 'Project deleted' });
});

router.post('/:id/duplicate',  async (req: Request, res: Response): Promise<void> => {
  const source = await prisma.project.findFirst({
    where: { id: req.params.id, ...orgScope(req) },
    include: {
      photographyTypes: true,
      shootingDays: true,
      shotSections: { include: { categories: { include: { locations: { include: { shots: true } } } } } },
    },
  });
  if (!source) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const newProject = await prisma.project.create({
    data: {
      name: `${source.name} (Copy)`,
      clientName: source.clientName,
      location: source.location,
      agencyName: source.agencyName,
      footerText: source.footerText,
      status: 'DRAFT',
      organisationId: source.organisationId,
      createdById: req.user!.userId,
    },
  });

  // Duplicate photography types with id mapping
  const typeMap = new Map<string, string>();
  for (const t of source.photographyTypes) {
    const newType = await prisma.photographyType.create({
      data: { name: t.name, hexColour: t.hexColour, sortOrder: t.sortOrder, projectId: newProject.id },
    });
    typeMap.set(t.id, newType.id);
  }

  // Duplicate shot structure
  for (const section of source.shotSections) {
    const newSection = await prisma.shotSection.create({
      data: { name: section.name, sortOrder: section.sortOrder, projectId: newProject.id },
    });
    for (const cat of section.categories) {
      const newCat = await prisma.shotCategory.create({
        data: {
          name: cat.name,
          sortOrder: cat.sortOrder,
          isVisible: cat.isVisible,
          sectionId: newSection.id,
          projectId: newProject.id,
          photographyTypeId: cat.photographyTypeId ? typeMap.get(cat.photographyTypeId) : null,
        },
      });
      for (const loc of cat.locations) {
        const newLoc = await prisma.shotLocation.create({
          data: { name: loc.name, sortOrder: loc.sortOrder, isVisible: loc.isVisible, categoryId: newCat.id, projectId: newProject.id },
        });
        for (const shot of loc.shots) {
          await prisma.shot.create({
            data: {
              description: shot.description,
              timing: shot.timing,
              notes: shot.notes,
              sortOrder: shot.sortOrder,
              isVisible: shot.isVisible,
              status: 'PENDING',
              locationId: newLoc.id,
              projectId: newProject.id,
            },
          });
        }
      }
    }
  }

  res.status(201).json(newProject);
});

export default router;
