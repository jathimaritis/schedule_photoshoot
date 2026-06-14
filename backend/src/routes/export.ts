import { Router, Request, Response } from 'express';
import prisma from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { buildScheduleWorkbook, buildAllCallSheetsWorkbook, buildSingleCallSheetWorkbook, ScheduleProject } from '../services/exportExcel';

const router = Router({ mergeParams: true });
router.use(authenticate);

async function getFullProject(projectId: string, organisationId: string): Promise<ScheduleProject | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organisationId },
    include: {
      photographyTypes: { orderBy: { sortOrder: 'asc' } },
      shootingDays: { orderBy: { dayNumber: 'asc' }, include: { photographyType: true } },
      shotSections: {
        orderBy: { sortOrder: 'asc' },
        include: {
          categories: {
            orderBy: { sortOrder: 'asc' },
            include: {
              locations: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  shots: {
                    where: { isVisible: true },
                    orderBy: { sortOrder: 'asc' },
                    include: { dayAssignments: true },
                  },
                },
              },
            },
          },
        },
      },
      callSheets: {
        include: {
          fields: { where: { isVisible: true }, orderBy: [{ fieldGroup: 'asc' }, { sortOrder: 'asc' }] },
          shots: {
            orderBy: { sortOrder: 'asc' },
            include: {
              shot: {
                include: {
                  location: { include: { category: { include: { photographyType: true } } } },
                  dayAssignments: true,
                },
              },
            },
          },
        },
      },
      _count: { select: { shots: true } },
    },
  });

  if (!project) return null;

  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { logoUrl: true },
  });

  return {
    ...project,
    totalShots: project._count.shots,
    sections: project.shotSections,
    logoUrl: org?.logoUrl ?? null,
  } as unknown as ScheduleProject;
}

function sendXlsx(res: Response, buffer: Buffer, filename: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

router.get('/schedule.xlsx', async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await getFullProject(req.params.id, req.user!.organisationId);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
    const buffer = await buildScheduleWorkbook(project);
    sendXlsx(res, buffer, `${project.name.replace(/[^a-z0-9]/gi, '_')}_schedule.xlsx`);
  } catch (err) {
    console.error('Schedule export error:', err);
    res.status(500).json({ error: 'Failed to generate export. Please try again.' });
  }
});

router.get('/callsheets.xlsx', async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await getFullProject(req.params.id, req.user!.organisationId);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
    const buffer = await buildAllCallSheetsWorkbook(project);
    sendXlsx(res, buffer, `${project.name.replace(/[^a-z0-9]/gi, '_')}_callsheets.xlsx`);
  } catch (err) {
    console.error('Callsheets export error:', err);
    res.status(500).json({ error: 'Failed to generate export. Please try again.' });
  }
});

router.get('/callsheet/:dayId.xlsx', async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await getFullProject(req.params.id, req.user!.organisationId);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
    const buffer = await buildSingleCallSheetWorkbook(project, req.params.dayId);
    sendXlsx(res, buffer, `callsheet_day_${req.params.dayId}.xlsx`);
  } catch (err) {
    console.error('Callsheet export error:', err);
    res.status(500).json({ error: 'Failed to generate export. Please try again.' });
  }
});

export default router;
