import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import prisma from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const callSheetSchema = z.object({
  projectName: z.string().min(1),
  client: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  shootingDate: z.string().optional().nullable(),
  generalNotes: z.string().optional().nullable(),
  sunrise: z.string().optional().nullable(),
  sunset: z.string().optional().nullable(),
  goldenHourAm: z.string().optional().nullable(),
  goldenHourPm: z.string().optional().nullable(),
  blueHourAm: z.string().optional().nullable(),
  blueHourPm: z.string().optional().nullable(),
  startOfDay: z.string().optional().nullable(),
  breakfastTime: z.string().optional().nullable(),
  lunchTime: z.string().optional().nullable(),
  dinnerTime: z.string().optional().nullable(),
  endOfDay: z.string().optional().nullable(),
});

const shotSchema = z.object({
  shootingLocation: z.string().optional().nullable(),
  description: z.string().min(1),
  timing: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE']).optional(),
  sortOrder: z.number().int().optional(),
});

async function getSheet(id: string, organisationId: string) {
  return prisma.productionCallSheet.findFirst({
    where: { id, organisationId },
    include: { shots: { orderBy: { sortOrder: 'asc' } } },
  });
}

// List
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const sheets = await prisma.productionCallSheet.findMany({
    where: { organisationId: req.user!.organisationId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { shots: true } } },
  });
  res.json(sheets);
});

// Create
router.post('/', validate(callSheetSchema), async (req: Request, res: Response): Promise<void> => {
  const { shootingDate, ...rest } = req.body;
  const sheet = await prisma.productionCallSheet.create({
    data: {
      ...rest,
      shootingDate: shootingDate ? new Date(shootingDate) : null,
      organisationId: req.user!.organisationId,
      createdById: req.user!.userId,
    },
    include: { shots: true },
  });
  res.status(201).json(sheet);
});

// Get one
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const sheet = await getSheet(req.params.id, req.user!.organisationId);
  if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(sheet);
});

// Update
router.put('/:id', validate(callSheetSchema.partial()), async (req: Request, res: Response): Promise<void> => {
  const sheet = await getSheet(req.params.id, req.user!.organisationId);
  if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
  const { shootingDate, ...rest } = req.body;
  const updated = await prisma.productionCallSheet.update({
    where: { id: sheet.id },
    data: {
      ...rest,
      ...(shootingDate !== undefined ? { shootingDate: shootingDate ? new Date(shootingDate) : null } : {}),
      updatedAt: new Date(),
    },
    include: { shots: { orderBy: { sortOrder: 'asc' } } },
  });
  res.json(updated);
});

// Delete
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const sheet = await getSheet(req.params.id, req.user!.organisationId);
  if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
  await prisma.productionCallSheet.delete({ where: { id: sheet.id } });
  res.json({ message: 'Deleted' });
});

// Add shot
router.post('/:id/shots', validate(shotSchema), async (req: Request, res: Response): Promise<void> => {
  const sheet = await getSheet(req.params.id, req.user!.organisationId);
  if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
  const maxOrder = sheet.shots.reduce((m, s) => Math.max(m, s.sortOrder), -1);
  const shot = await prisma.productionShot.create({
    data: { ...req.body, sortOrder: req.body.sortOrder ?? maxOrder + 1, callSheetId: sheet.id },
  });
  res.status(201).json(shot);
});

// Update shot
router.put('/:id/shots/:shotId', validate(shotSchema.partial()), async (req: Request, res: Response): Promise<void> => {
  const sheet = await getSheet(req.params.id, req.user!.organisationId);
  if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
  const shot = sheet.shots.find((s) => s.id === req.params.shotId);
  if (!shot) { res.status(404).json({ error: 'Shot not found' }); return; }
  const updated = await prisma.productionShot.update({ where: { id: shot.id }, data: req.body });
  res.json(updated);
});

// Delete shot
router.delete('/:id/shots/:shotId', async (req: Request, res: Response): Promise<void> => {
  const sheet = await getSheet(req.params.id, req.user!.organisationId);
  if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
  const shot = sheet.shots.find((s) => s.id === req.params.shotId);
  if (!shot) { res.status(404).json({ error: 'Shot not found' }); return; }
  await prisma.productionShot.delete({ where: { id: shot.id } });
  res.json({ message: 'Deleted' });
});

// Import shots from xlsx
router.post('/:id/import-shots', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  const sheet = await getSheet(req.params.id, req.user!.organisationId);
  if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });

  let order = sheet.shots.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1;
  let imported = 0;
  for (const row of rows) {
    const description = String(row['Shot'] || row['Description'] || row['description'] || '').trim();
    if (!description) continue;
    await prisma.productionShot.create({
      data: {
        callSheetId: sheet.id,
        shootingLocation: String(row['Shooting Location'] || row['Location'] || '').trim() || null,
        description,
        timing: String(row['Timing'] || '').trim() || null,
        notes: String(row['Notes'] || '').trim() || null,
        sortOrder: order++,
      },
    });
    imported++;
  }
  res.json({ imported });
});

// Export Excel
router.get('/:id/export/excel', async (req: Request, res: Response): Promise<void> => {
  try {
    const sheet = await getSheet(req.params.id, req.user!.organisationId);
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Photoshoot Scheduler';
    const NAVY = '1A1A2E';
    const GOLD = 'D4AF37';
    const LIGHT = 'F0F0F0';

    const fill = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } });
    const wfont = (size = 10): Partial<ExcelJS.Font> => ({ name: 'Calibri', size, color: { argb: 'FFFFFFFF' }, bold: true });
    const bfont = (size = 10): Partial<ExcelJS.Font> => ({ name: 'Calibri', size, color: { argb: 'FF1A1A1A' } });

    const addHeaderRow = (ws: ExcelJS.Worksheet, label: string, colSpan: number) => {
      const row = ws.addRow([label]);
      ws.mergeCells(`A${row.number}:${String.fromCharCode(64 + colSpan)}${row.number}`);
      row.getCell(1).fill = fill(NAVY);
      row.getCell(1).font = wfont(12);
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.height = 24;
    };

    // Sheet 1: Call Sheet Details
    const ws1 = wb.addWorksheet('Production Details');
    ws1.columns = [{ width: 22 }, { width: 30 }, { width: 22 }, { width: 30 }];
    addHeaderRow(ws1, `${sheet.projectName} — PRODUCTION CALL SHEET`, 4);

    const addDetailSection = (title: string, rows: [string, string | null | undefined][]) => {
      const hRow = ws1.addRow([title]);
      ws1.mergeCells(`A${hRow.number}:D${hRow.number}`);
      hRow.getCell(1).fill = fill('2C2C54');
      hRow.getCell(1).font = wfont(10);
      hRow.height = 18;
      for (let i = 0; i < rows.length; i += 2) {
        const [l1, v1] = rows[i];
        const [l2, v2] = rows[i + 1] ?? ['', ''];
        const r = ws1.addRow([l1, v1 ?? '', l2, v2 ?? '']);
        r.getCell(1).fill = fill(LIGHT); r.getCell(1).font = bfont(); (r.getCell(1).font as ExcelJS.Font).bold = true;
        r.getCell(2).font = bfont();
        r.getCell(3).fill = fill(LIGHT); r.getCell(3).font = bfont(); (r.getCell(3).font as ExcelJS.Font).bold = true;
        r.getCell(4).font = bfont();
        r.height = 18;
      }
      ws1.addRow([]);
    };

    addDetailSection('PROJECT DETAILS', [
      ['Client', sheet.client],
      ['Project Name', sheet.projectName],
      ['Location', sheet.location],
      ['Shooting Date', sheet.shootingDate ? format(new Date(sheet.shootingDate), 'dd MMMM yyyy') : ''],
      ['General Notes', sheet.generalNotes],
    ]);

    addDetailSection('LIGHT & WEATHER TIMES', [
      ['Sunrise', sheet.sunrise],
      ['Sunset', sheet.sunset],
      ['Golden Hour AM', sheet.goldenHourAm],
      ['Golden Hour PM', sheet.goldenHourPm],
      ['Blue Hour AM', sheet.blueHourAm],
      ['Blue Hour PM', sheet.blueHourPm],
    ]);

    addDetailSection('DAILY LOGISTICS', [
      ['Start of Day', sheet.startOfDay],
      ['Breakfast', sheet.breakfastTime],
      ['Lunch', sheet.lunchTime],
      ['Dinner', sheet.dinnerTime],
      ['End of Day', sheet.endOfDay],
    ]);

    // Sheet 2: Shot List
    const ws2 = wb.addWorksheet('Shot List');
    ws2.columns = [{ width: 22 }, { width: 32 }, { width: 12 }, { width: 30 }, { width: 12 }];
    addHeaderRow(ws2, 'SHOT LIST', 5);

    const hdr = ws2.addRow(['Shooting Location', 'Shot Description', 'Timing', 'Notes', 'Status']);
    hdr.height = 18;
    for (let c = 1; c <= 5; c++) {
      hdr.getCell(c).fill = fill('2C2C54');
      hdr.getCell(c).font = wfont(9);
      hdr.getCell(c).alignment = { horizontal: 'center' };
    }

    sheet.shots.forEach((s, i) => {
      const r = ws2.addRow([s.shootingLocation ?? '', s.description, s.timing ?? '', s.notes ?? '', s.status]);
      r.height = 16;
      const bg = i % 2 === 0 ? 'FFFFFF' : 'FAFAFA';
      for (let c = 1; c <= 5; c++) {
        r.getCell(c).fill = fill(bg);
        r.getCell(c).font = bfont();
      }
    });

    const buf = await wb.xlsx.writeBuffer();
    const safeName = sheet.projectName.replace(/[^a-z0-9]/gi, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_callsheet.xlsx"`);
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ error: 'Failed to generate export' });
  }
});

// Export PDF
router.get('/:id/export/pdf', async (req: Request, res: Response): Promise<void> => {
  try {
    const sheet = await getSheet(req.params.id, req.user!.organisationId);
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sheet.projectName.replace(/[^a-z0-9]/gi, '_')}_callsheet.pdf"`);
    doc.pipe(res);

    const NAVY_RGB = [26, 26, 46] as const;
    const GOLD_RGB = [212, 175, 55] as const;
    const GREY_RGB = [240, 240, 240] as const;

    const pageW = doc.page.width - 80;

    // Title bar
    doc.rect(40, 40, pageW, 30).fill(`rgb(${NAVY_RGB.join(',')})`);
    doc.fillColor(`rgb(${GOLD_RGB.join(',')})`).fontSize(14).font('Helvetica-Bold')
      .text(sheet.projectName.toUpperCase() + ' — PRODUCTION CALL SHEET', 40, 48, { width: pageW, align: 'center' });

    let y = 80;

    const section = (title: string) => {
      doc.rect(40, y, pageW, 18).fill(`rgb(44,44,84)`);
      doc.fillColor('white').fontSize(9).font('Helvetica-Bold').text(title, 44, y + 4);
      y += 22;
    };

    const row2col = (l1: string, v1: string, l2: string, v2: string) => {
      if (y > doc.page.height - 80) { doc.addPage(); y = 40; }
      doc.rect(40, y, pageW / 2, 16).fill(`rgb(${GREY_RGB.join(',')})`);
      doc.rect(40 + pageW / 2, y, pageW / 2, 16).fill('white');
      doc.fillColor('#333').fontSize(8).font('Helvetica-Bold').text(l1, 44, y + 3, { width: pageW / 4 });
      doc.fillColor('#333').font('Helvetica').text(v1, 44 + pageW / 4, y + 3, { width: pageW / 4 - 4 });
      doc.fillColor('#333').font('Helvetica-Bold').text(l2, 44 + pageW / 2, y + 3, { width: pageW / 4 });
      doc.fillColor('#333').font('Helvetica').text(v2, 44 + pageW * 3 / 4, y + 3, { width: pageW / 4 - 4 });
      y += 18;
    };

    const row1col = (label: string, value: string) => {
      if (y > doc.page.height - 80) { doc.addPage(); y = 40; }
      doc.rect(40, y, pageW, 16).fill(`rgb(${GREY_RGB.join(',')})`);
      doc.fillColor('#333').fontSize(8).font('Helvetica-Bold').text(label, 44, y + 3, { width: pageW / 4 });
      doc.fillColor('#333').font('Helvetica').text(value, 44 + pageW / 4, y + 3, { width: pageW * 3 / 4 - 4 });
      y += 18;
    };

    // Project details
    section('PROJECT DETAILS');
    row2col('Client', sheet.client ?? '', 'Project Name', sheet.projectName);
    row1col('Location', sheet.location ?? '');
    row2col('Shooting Date', sheet.shootingDate ? format(new Date(sheet.shootingDate), 'dd MMMM yyyy') : '', '', '');
    if (sheet.generalNotes) row1col('Notes', sheet.generalNotes);
    y += 8;

    // Light & weather
    section('LIGHT & WEATHER TIMES');
    row2col('Sunrise', sheet.sunrise ?? '', 'Sunset', sheet.sunset ?? '');
    row2col('Golden Hour AM', sheet.goldenHourAm ?? '', 'Golden Hour PM', sheet.goldenHourPm ?? '');
    row2col('Blue Hour AM', sheet.blueHourAm ?? '', 'Blue Hour PM', sheet.blueHourPm ?? '');
    y += 8;

    // Logistics
    section('DAILY LOGISTICS');
    row2col('Start of Day', sheet.startOfDay ?? '', 'End of Day', sheet.endOfDay ?? '');
    row2col('Breakfast', sheet.breakfastTime ?? '', 'Lunch', sheet.lunchTime ?? '');
    row1col('Dinner', sheet.dinnerTime ?? '');
    y += 8;

    // Shot list
    section('SHOT LIST');
    // Header
    const cols = [pageW * 0.2, pageW * 0.33, pageW * 0.1, pageW * 0.27, pageW * 0.1];
    const colX = cols.reduce<number[]>((acc, w) => { acc.push((acc[acc.length - 1] ?? 40) + (acc.length > 0 ? cols[acc.length - 1] : 0)); return acc; }, [40]);
    const hdrs = ['Shooting Location', 'Description', 'Timing', 'Notes', 'Status'];
    doc.rect(40, y, pageW, 16).fill(`rgb(44,44,84)`);
    hdrs.forEach((h, i) => {
      doc.fillColor('white').fontSize(7.5).font('Helvetica-Bold').text(h, colX[i] + 2, y + 4, { width: cols[i] - 4, align: 'center' });
    });
    y += 18;

    sheet.shots.forEach((s, i) => {
      const rowH = 16;
      if (y > doc.page.height - 80) { doc.addPage(); y = 40; }
      doc.rect(40, y, pageW, rowH).fill(i % 2 === 0 ? 'white' : `rgb(${GREY_RGB.join(',')})`);
      const vals = [s.shootingLocation ?? '', s.description, s.timing ?? '', s.notes ?? '', s.status];
      vals.forEach((v, j) => {
        doc.fillColor('#333').fontSize(7.5).font('Helvetica').text(v, colX[j] + 2, y + 4, { width: cols[j] - 4, lineBreak: false });
      });
      y += rowH;
    });

    doc.end();
  } catch (err) {
    console.error('PDF export error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

export default router;
