import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import * as XLSX from 'xlsx';
import prisma from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router({ mergeParams: true });
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const sectionSchema = z.object({ name: z.string().min(1), sortOrder: z.number().int().optional(), photographyTypeId: z.string().optional().nullable() });
const categorySchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  isVisible: z.boolean().optional(),
  sectionId: z.string(),
  photographyTypeId: z.string().optional().nullable(),
});
const locationSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  isVisible: z.boolean().optional(),
  categoryId: z.string(),
  photographyTypeId: z.string().optional().nullable(),
});
const shotSchema = z.object({
  description: z.string().min(1),
  timing: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
  isVisible: z.boolean().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE']).optional(),
  tickColourOverride: z.string().optional().nullable(),
  locationId: z.string(),
});
const assignmentSchema = z.object({
  shotId: z.string(),
  shootingDayId: z.string(),
  tickColour: z.string().optional().nullable(),
});
const reorderSchema = z.object({ sortOrder: z.number().int() });

async function getProject(projectId: string, organisationId: string) {
  return prisma.project.findFirst({ where: { id: projectId, organisationId } });
}

// Full nested shot list
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const sections = await prisma.shotSection.findMany({
    where: { projectId: project.id },
    orderBy: { sortOrder: 'asc' },
    include: {
      photographyType: true,
      categories: {
        orderBy: { sortOrder: 'asc' },
        include: {
          photographyType: true,
          locations: {
            orderBy: { sortOrder: 'asc' },
            include: {
              shots: {
                orderBy: { sortOrder: 'asc' },
                include: { dayAssignments: { include: { shootingDay: true } } },
              },
            },
          },
        },
      },
    },
  });
  res.json(sections);
});

// Import .xlsx shot list
router.post('/import',  upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });

  let sectionOrder = 0, categoryOrder = 0, locationOrder = 0, shotOrder = 0;
  const sectionMap = new Map<string, string>();
  const categoryMap = new Map<string, string>();
  const locationMap = new Map<string, string>();

  for (const row of rows) {
    const sectionName = String(row['Section'] || row['section'] || '').trim();
    const categoryName = String(row['Category'] || row['category'] || '').trim();
    const locationName = String(row['Location'] || row['location'] || '').trim();
    const description = String(row['Shot'] || row['shot'] || row['Description'] || row['description'] || '').trim();
    const timing = String(row['Timing'] || row['timing'] || '').trim();
    const notes = String(row['Notes'] || row['notes'] || '').trim();

    if (!description) continue;

    let sectionId = sectionMap.get(sectionName);
    if (!sectionId && sectionName) {
      const sec = await prisma.shotSection.create({ data: { name: sectionName, sortOrder: sectionOrder++, projectId: project.id } });
      sectionId = sec.id;
      sectionMap.set(sectionName, sectionId);
    }
    if (!sectionId) continue;

    const catKey = `${sectionId}::${categoryName}`;
    let categoryId = categoryMap.get(catKey);
    if (!categoryId && categoryName) {
      const cat = await prisma.shotCategory.create({ data: { name: categoryName, sortOrder: categoryOrder++, sectionId, projectId: project.id } });
      categoryId = cat.id;
      categoryMap.set(catKey, categoryId);
    }
    if (!categoryId) continue;

    const locKey = `${categoryId}::${locationName}`;
    let locationId = locationMap.get(locKey);
    if (!locationId && locationName) {
      const loc = await prisma.shotLocation.create({ data: { name: locationName, sortOrder: locationOrder++, categoryId, projectId: project.id } });
      locationId = loc.id;
      locationMap.set(locKey, locationId);
    }
    if (!locationId) continue;

    await prisma.shot.create({
      data: { description, timing: timing || null, notes: notes || null, sortOrder: shotOrder++, locationId, projectId: project.id },
    });
  }

  res.json({ message: 'Import complete', imported: rows.length });
});

// Sections
router.post('/sections',  validate(sectionSchema), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const section = await prisma.shotSection.create({ data: { ...req.body, projectId: project.id } });
  res.status(201).json(section);
});

router.put('/sections/:sectionId',  validate(sectionSchema.partial()), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const s = await prisma.shotSection.findFirst({ where: { id: req.params.sectionId, projectId: project.id } });
  if (!s) { res.status(404).json({ error: 'Section not found' }); return; }
  res.json(await prisma.shotSection.update({ where: { id: s.id }, data: req.body }));
});

router.delete('/sections/:sectionId',  async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const s = await prisma.shotSection.findFirst({ where: { id: req.params.sectionId, projectId: project.id } });
  if (!s) { res.status(404).json({ error: 'Section not found' }); return; }
  await prisma.shotSection.delete({ where: { id: s.id } });
  res.json({ message: 'Deleted' });
});

// Categories
router.post('/categories',  validate(categorySchema), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const cat = await prisma.shotCategory.create({ data: { ...req.body, projectId: project.id } });
  res.status(201).json(cat);
});

router.put('/categories/:catId',  validate(categorySchema.partial()), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const cat = await prisma.shotCategory.findFirst({ where: { id: req.params.catId, projectId: project.id } });
  if (!cat) { res.status(404).json({ error: 'Category not found' }); return; }
  res.json(await prisma.shotCategory.update({ where: { id: cat.id }, data: req.body }));
});

router.delete('/categories/:catId',  async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const cat = await prisma.shotCategory.findFirst({ where: { id: req.params.catId, projectId: project.id } });
  if (!cat) { res.status(404).json({ error: 'Category not found' }); return; }
  await prisma.shotCategory.delete({ where: { id: cat.id } });
  res.json({ message: 'Deleted' });
});

// Locations
router.post('/locations',  validate(locationSchema), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const loc = await prisma.shotLocation.create({ data: { ...req.body, projectId: project.id } });
  res.status(201).json(loc);
});

router.put('/locations/:locId',  validate(locationSchema.partial()), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const loc = await prisma.shotLocation.findFirst({ where: { id: req.params.locId, projectId: project.id } });
  if (!loc) { res.status(404).json({ error: 'Location not found' }); return; }
  res.json(await prisma.shotLocation.update({ where: { id: loc.id }, data: req.body }));
});

router.delete('/locations/:locId',  async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const loc = await prisma.shotLocation.findFirst({ where: { id: req.params.locId, projectId: project.id } });
  if (!loc) { res.status(404).json({ error: 'Location not found' }); return; }
  await prisma.shotLocation.delete({ where: { id: loc.id } });
  res.json({ message: 'Deleted' });
});

// Shots
router.post('/shots-item',  validate(shotSchema), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const shot = await prisma.shot.create({ data: { ...req.body, projectId: project.id } });
  res.status(201).json(shot);
});

router.put('/shots-item/:shotId',  validate(shotSchema.partial()), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const shot = await prisma.shot.findFirst({ where: { id: req.params.shotId, projectId: project.id } });
  if (!shot) { res.status(404).json({ error: 'Shot not found' }); return; }
  res.json(await prisma.shot.update({ where: { id: shot.id }, data: req.body }));
});

router.delete('/shots-item/:shotId',  async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const shot = await prisma.shot.findFirst({ where: { id: req.params.shotId, projectId: project.id } });
  if (!shot) { res.status(404).json({ error: 'Shot not found' }); return; }
  await prisma.shot.delete({ where: { id: shot.id } });
  res.json({ message: 'Deleted' });
});

router.post('/shots-item/:shotId/reorder',  validate(reorderSchema), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const shot = await prisma.shot.findFirst({ where: { id: req.params.shotId, projectId: project.id } });
  if (!shot) { res.status(404).json({ error: 'Shot not found' }); return; }
  res.json(await prisma.shot.update({ where: { id: shot.id }, data: { sortOrder: req.body.sortOrder } }));
});

// Assignments
router.post('/assignments',  validate(assignmentSchema), async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const shot = await prisma.shot.findFirst({ where: { id: req.body.shotId, projectId: project.id } });
  if (!shot) { res.status(404).json({ error: 'Shot not found' }); return; }
  const day = await prisma.shootingDay.findFirst({ where: { id: req.body.shootingDayId, projectId: project.id } });
  if (!day) { res.status(404).json({ error: 'Day not found' }); return; }

  const assignment = await prisma.shotDayAssignment.upsert({
    where: { shotId_shootingDayId: { shotId: shot.id, shootingDayId: day.id } },
    create: { shotId: shot.id, shootingDayId: day.id, tickColour: req.body.tickColour },
    update: { tickColour: req.body.tickColour },
  });
  res.status(201).json(assignment);
});

router.delete('/assignments/:assignmentId',  async (req: Request, res: Response): Promise<void> => {
  const project = await getProject(req.params.id, req.user!.organisationId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const assignment = await prisma.shotDayAssignment.findFirst({
    where: { id: req.params.assignmentId },
    include: { shot: true },
  });
  if (!assignment || assignment.shot.projectId !== project.id) {
    res.status(404).json({ error: 'Assignment not found' }); return;
  }
  await prisma.shotDayAssignment.delete({ where: { id: assignment.id } });
  res.json({ message: 'Assignment removed' });
});

export default router;
