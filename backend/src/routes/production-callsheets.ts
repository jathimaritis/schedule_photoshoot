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

const contactSchema = z.object({
  id: z.string(),
  title: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
});

const weatherDataSchema = z.object({
  description: z.string().optional().nullable(),
  tempMax: z.number().optional().nullable(),
  tempMin: z.number().optional().nullable(),
  precipitation: z.number().optional().nullable(),
  windSpeed: z.number().optional().nullable(),
}).optional().nullable();

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
  contacts: z.array(contactSchema).optional().nullable(),
  weatherData: weatherDataSchema,
  locationLat: z.number().optional().nullable(),
  locationLng: z.number().optional().nullable(),
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

// WMO weather code descriptions
const WMO: Record<number, string> = {
  0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
  45:'Fog',48:'Icy fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
  61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',
  77:'Snow grains',80:'Light showers',81:'Showers',82:'Heavy showers',
  85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',
  96:'Thunderstorm w/ hail',99:'Heavy thunderstorm w/ hail',
};

function parseIsoTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function shiftTime(t: string, mins: number): string {
  const [h, m] = t.split(':').map(Number);
  const total = ((h * 60 + m + mins) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

// Sun times + weather.
// Primary: ?lat=<number>&lng=<number>&date=<yyyy-MM-dd>  (exact coords from Google Places — no geocoding)
// Fallback: ?location=<string>&date=<yyyy-MM-dd>  (geocodes text string via Open-Meteo)
// Returns partial results if one API fails.
// Must come BEFORE /:id route.
router.get('/sun-times', async (req: Request, res: Response): Promise<void> => {
  console.log('[sun-times] query:', req.query);
  const { lat, lng, location, date } = req.query as Record<string, string>;

  if (!date) {
    res.status(400).json({ error: 'date is required' });
    return;
  }

  let latitude: number;
  let longitude: number;

  if (lat && lng) {
    latitude = parseFloat(lat);
    longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude)) {
      res.status(400).json({ error: 'Invalid lat/lng values' });
      return;
    }
    console.log('[sun-times] using provided coordinates:', latitude, longitude);
  } else if (location) {
    console.log('[sun-times] geocoding location text (fallback):', location);
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
      const geoResp = await fetch(geoUrl);
      if (!geoResp.ok) throw new Error(`Geocoding failed: HTTP ${geoResp.status}`);
      const geoData = await geoResp.json() as { results?: { latitude: number; longitude: number; name: string; country?: string }[] };
      const place = geoData.results?.[0];
      if (!place) throw new Error(`Location not found: "${location}"`);
      latitude = place.latitude;
      longitude = place.longitude;
      console.log('[sun-times] geocoded to:', latitude, longitude, place.name, place.country ?? '');
    } catch (err) {
      console.error('[sun-times] geocoding failed:', err);
      res.status(502).json({ error: (err as Error).message ?? 'Geocoding failed' });
      return;
    }
  } else {
    res.status(400).json({ error: 'Either lat+lng or location is required' });
    return;
  }

  // Convert UTC ISO string from sunrise-sunset.org to local HH:mm using offset from Open-Meteo
  function utcIsoToLocal(isoUtc: string, offsetSeconds: number): string {
    const ms = new Date(isoUtc).getTime() + offsetSeconds * 1000;
    const d = new Date(ms);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }

  // Call Open-Meteo (weather + timezone + sun times as fallback) and sunrise-sunset.org in parallel
  const meteoUrl = [
    'https://api.open-meteo.com/v1/forecast',
    `?latitude=${latitude}&longitude=${longitude}`,
    `&daily=sunrise,sunset,weathercode,precipitation_sum,windspeed_10m_max,temperature_2m_max,temperature_2m_min`,
    `&timezone=auto&start_date=${date}&end_date=${date}`,
  ].join('');
  const sunApiUrl = `https://api.sunrise-sunset.org/json?lat=${latitude}&lng=${longitude}&date=${date}&formatted=0`;

  console.log('[sun-times] fetching Open-Meteo:', meteoUrl);
  console.log('[sun-times] fetching sunrise-sunset.org:', sunApiUrl);

  const [meteoSettled, sunSettled] = await Promise.allSettled([
    fetch(meteoUrl).then(async (r) => {
      if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
      return r.json() as Promise<{
        utc_offset_seconds?: number;
        daily?: {
          sunrise?: string[]; sunset?: string[];
          weathercode?: number[];
          precipitation_sum?: number[];
          windspeed_10m_max?: number[];
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
        };
      }>;
    }),
    fetch(sunApiUrl).then(async (r) => {
      if (!r.ok) throw new Error(`sunrise-sunset.org HTTP ${r.status}`);
      return r.json() as Promise<{
        status: string;
        results?: { sunrise: string; sunset: string; civil_twilight_begin: string; civil_twilight_end: string };
      }>;
    }),
  ]);

  if (meteoSettled.status === 'rejected') console.warn('[sun-times] Open-Meteo failed:', meteoSettled.reason);
  if (sunSettled.status === 'rejected') console.warn('[sun-times] sunrise-sunset.org failed:', sunSettled.reason);

  if (meteoSettled.status === 'rejected' && sunSettled.status === 'rejected') {
    res.status(502).json({ error: 'Both sun-time and weather APIs failed. Enter times manually.' });
    return;
  }

  const meteo = meteoSettled.status === 'fulfilled' ? meteoSettled.value : null;
  const sunApi = sunSettled.status === 'fulfilled' && sunSettled.value.status === 'OK' ? sunSettled.value : null;
  const utcOffset = meteo?.utc_offset_seconds ?? null;

  // Determine sunrise/sunset: prefer sunrise-sunset.org (more accurate) if we have the UTC offset to convert
  let sunriseTime: string | null = null;
  let sunsetTime: string | null = null;
  let goldenHourAmTime: string | null = null;
  let goldenHourPmTime: string | null = null;
  let blueHourAmTime: string | null = null;
  let blueHourPmTime: string | null = null;

  if (sunApi?.results && utcOffset != null) {
    sunriseTime = utcIsoToLocal(sunApi.results.sunrise, utcOffset);
    sunsetTime  = utcIsoToLocal(sunApi.results.sunset, utcOffset);
    // Civil twilight begin = golden hour start AM; civil twilight end = golden hour end PM
    goldenHourAmTime = utcIsoToLocal(sunApi.results.civil_twilight_begin, utcOffset);
    goldenHourPmTime = utcIsoToLocal(sunApi.results.civil_twilight_end, utcOffset);
    blueHourAmTime   = sunriseTime ? shiftTime(sunriseTime, -40) : null;
    blueHourPmTime   = sunsetTime;
    console.log('[sun-times] using sunrise-sunset.org:', sunriseTime, sunsetTime);
  } else {
    // Fall back to Open-Meteo sun times
    const sunriseIso = meteo?.daily?.sunrise?.[0];
    const sunsetIso  = meteo?.daily?.sunset?.[0];
    sunriseTime = sunriseIso ? parseIsoTime(sunriseIso) : null;
    sunsetTime  = sunsetIso  ? parseIsoTime(sunsetIso)  : null;
    goldenHourAmTime = sunriseTime;
    goldenHourPmTime = sunsetTime ? shiftTime(sunsetTime, -60) : null;
    blueHourAmTime   = sunriseTime ? shiftTime(sunriseTime, -40) : null;
    blueHourPmTime   = sunsetTime;
    console.log('[sun-times] using Open-Meteo sun times:', sunriseTime, sunsetTime);
  }

  const wCode = meteo?.daily?.weathercode?.[0];
  const result = {
    sunrise:      sunriseTime,
    sunset:       sunsetTime,
    goldenHourAm: goldenHourAmTime,
    goldenHourPm: goldenHourPmTime,
    blueHourAm:   blueHourAmTime,
    blueHourPm:   blueHourPmTime,
    weather: {
      description:   wCode !== undefined ? (WMO[wCode] ?? `Code ${wCode}`) : null,
      tempMax:       meteo?.daily?.temperature_2m_max?.[0] != null ? Math.round(meteo.daily.temperature_2m_max[0]!) : null,
      tempMin:       meteo?.daily?.temperature_2m_min?.[0] != null ? Math.round(meteo.daily.temperature_2m_min[0]!) : null,
      precipitation: meteo?.daily?.precipitation_sum?.[0] ?? null,
      windSpeed:     meteo?.daily?.windspeed_10m_max?.[0] != null ? Math.round(meteo.daily.windspeed_10m_max[0]!) : null,
    },
  };
  console.log('[sun-times] result:', JSON.stringify(result).slice(0, 400));
  res.json(result);
});

// List
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const sheets = await prisma.productionCallSheet.findMany({
    where: {
      organisationId: req.user!.organisationId,
      ...(req.user!.role === 'MEMBER' ? { createdById: req.user!.userId } : {}),
    },
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
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  // Log raw rows for debugging column headers
  console.log('[import-shots] columns detected:', rows[0] ? Object.keys(rows[0]) : 'no rows');
  console.log('[import-shots] first 3 rows:', JSON.stringify(rows.slice(0, 3)));

  let order = sheet.shots.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1;
  let imported = 0;

  for (const row of rows) {
    // Normalize: lowercase + trim all keys for case-insensitive matching
    const norm: Record<string, string> = {};
    for (const key of Object.keys(row)) {
      norm[key.toLowerCase().trim()] = String(row[key] ?? '').trim();
    }
    // Helper: first matching non-empty value from a list of candidate keys
    const get = (...keys: string[]) => keys.map((k) => norm[k.toLowerCase().trim()]).find((v) => v) ?? '';

    const description = get('shot', 'description', 'shot description');
    if (!description) continue;

    await prisma.productionShot.create({
      data: {
        callSheetId: sheet.id,
        shootingLocation: get('shooting location', 'location', 'shot location') || null,
        description,
        timing: get('timing') || null,
        notes: get('notes') || null,
        sortOrder: order++,
      },
    });
    imported++;
  }
  res.json({ imported });
});

// Export Excel — single sheet
router.get('/:id/export/excel', async (req: Request, res: Response): Promise<void> => {
  try {
    const sheet = await getSheet(req.params.id, req.user!.organisationId);
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }

    const org = await prisma.organisation.findUnique({
      where: { id: sheet.organisationId },
      select: { logoUrl: true },
    });
    const logoUrl = org?.logoUrl ?? null;

    const contacts = (Array.isArray(sheet.contacts) ? sheet.contacts : []) as Array<{
      title?: string; name?: string; phone?: string; email?: string;
    }>;
    const wd = sheet.weatherData as { description?: string; tempMax?: number; tempMin?: number; precipitation?: number; windSpeed?: number } | null;

    // ── Brand colours (no # prefix) ───────────────────────────────────────
    const DARK   = '2C2318';
    const MID    = '7A5C3A';
    const TAN    = 'B89A7A';
    const CREAM  = 'F5F0EB';
    const OWHITE = 'FAFAF8';

    const mkFill = (c: string): ExcelJS.Fill =>
      ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${c}` } });
    const tanBorder = (): Partial<ExcelJS.Borders> =>
      ({ bottom: { style: 'thin', color: { argb: `FF${TAN}` } } });
    const medBorder = (): Partial<ExcelJS.Borders> =>
      ({ bottom: { style: 'medium', color: { argb: `FF${TAN}` } } });
    const bodyFont = (color = DARK, size = 10, bold = false): Partial<ExcelJS.Font> =>
      ({ name: 'Calibri', size, bold, color: { argb: `FF${color}` } });
    const wFont = (size = 10, bold = false): Partial<ExcelJS.Font> =>
      ({ name: 'Calibri', size, bold, color: { argb: 'FFFFFFFF' } });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Photoshoot Scheduler';
    const ws = wb.addWorksheet('Call Sheet');

    // Columns: A=# B=Location C=Description D=Timing E=Notes F=Done
    ws.columns = [
      { width: 5  },   // A  #
      { width: 25 },   // B  Shooting Location / label1
      { width: 35 },   // C  Description / value1
      { width: 15 },   // D  Timing / label2  (15 to fit "Golden Hour PM")
      { width: 20 },   // E  Notes / value2
      { width: 8  },   // F  Done
    ];

    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    ws.views = [{ state: 'frozen', ySplit: 6, showGridLines: false }];

    const shootDate = sheet.shootingDate ? format(new Date(sheet.shootingDate), 'dd MMMM yyyy') : '';
    const subLine   = [sheet.client, sheet.location, shootDate].filter(Boolean).join('   |   ');

    // merge helper: merges columns from→to on a given row object
    const merge = (r: ExcelJS.Row, from: string, to: string) =>
      ws.mergeCells(`${from}${r.number}:${to}${r.number}`);

    // ── HEADER BLOCK rows 1–5 (cream background so dark logo is visible) ──
    const r1 = ws.addRow(['']); merge(r1, 'A', 'F'); r1.height = 8;
    r1.getCell(1).fill = mkFill(CREAM);

    const r2 = ws.addRow(['']); merge(r2, 'A', 'F'); r2.height = 38; // logo row
    r2.getCell(1).fill = mkFill(CREAM);

    const r3 = ws.addRow(['PRODUCTION CALL SHEET']); merge(r3, 'A', 'F'); r3.height = 18;
    r3.getCell(1).fill = mkFill(CREAM);
    r3.getCell(1).font = bodyFont(DARK, 11);
    r3.getCell(1).alignment = { vertical: 'middle', indent: 1 };

    const r4 = ws.addRow([sheet.projectName]); merge(r4, 'A', 'F'); r4.height = 24;
    r4.getCell(1).fill = mkFill(CREAM);
    r4.getCell(1).font = bodyFont(DARK, 14, true);
    r4.getCell(1).alignment = { vertical: 'middle', indent: 1 };

    const r5 = ws.addRow([subLine]); merge(r5, 'A', 'F'); r5.height = 18;
    r5.getCell(1).fill = mkFill(CREAM);
    r5.getCell(1).font = bodyFont(DARK, 10);
    r5.getCell(1).alignment = { vertical: 'middle', indent: 1 };

    // ── ACCENT BAR row 6 ──────────────────────────────────────────────────
    const r6 = ws.addRow(['']); merge(r6, 'A', 'F'); r6.height = 4;
    r6.getCell(1).fill = mkFill(TAN);

    // ── Logo image (overlays rows 1–2) ────────────────────────────────────
    if (logoUrl) {
      try {
        const m = logoUrl.match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/);
        if (m) {
          const ext = m[1] === 'webp' ? 'png' : m[1] as 'png' | 'jpeg' | 'gif';
          const imgId = wb.addImage({ base64: m[2], extension: ext });
          ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 160, height: 45 } });
        }
      } catch { /* skip */ }
    }

    // ── Section header helper ─────────────────────────────────────────────
    const sectionHdr = (label: string) => {
      const r = ws.addRow([label.toUpperCase()]); merge(r, 'A', 'F');
      r.height = 22;
      r.getCell(1).fill = mkFill(CREAM);
      r.getCell(1).font = bodyFont(MID, 10, true);
      r.getCell(1).alignment = { vertical: 'middle', indent: 1 };
      r.getCell(1).border = medBorder();
    };

    // ── Detail row helper: A=empty B=label C=value D=label2 E=value2 F=empty ─
    let dAlt = 0;
    const detailRow = (l1: string, v1: string, l2 = '', v2 = '') => {
      const bg = dAlt++ % 2 === 0 ? CREAM : OWHITE;
      const r = ws.addRow(['', l1, v1, l2, v2, '']);
      r.height = 20;
      for (let c = 1; c <= 6; c++) r.getCell(c).fill = mkFill(bg);
      r.getCell(2).font = bodyFont(MID, 10);
      r.getCell(2).alignment = { vertical: 'middle' };
      r.getCell(3).font = bodyFont(DARK, 10);
      r.getCell(3).alignment = { vertical: 'middle', wrapText: true };
      r.getCell(4).font = bodyFont(MID, 10);
      r.getCell(4).alignment = { vertical: 'middle' };
      r.getCell(5).font = bodyFont(DARK, 10);
      r.getCell(5).alignment = { vertical: 'middle', wrapText: true };
    };

    // ── PROJECT DETAILS ───────────────────────────────────────────────────
    dAlt = 0;
    sectionHdr('Project Details');
    detailRow('Client', sheet.client ?? '', 'Project Name', sheet.projectName);
    detailRow('Location', sheet.location ?? '', 'Shooting Date', shootDate);

    // General Notes — full-width, min 80px
    const nr = ws.addRow(['', 'General Notes', sheet.generalNotes ?? '']);
    ws.mergeCells(`C${nr.number}:F${nr.number}`);
    nr.height = 80;
    for (let c = 1; c <= 6; c++) nr.getCell(c).fill = mkFill(OWHITE);
    nr.getCell(2).font = bodyFont(MID, 10);
    nr.getCell(2).alignment = { vertical: 'top' };
    nr.getCell(3).font = bodyFont(DARK, 10);
    nr.getCell(3).alignment = { wrapText: true, vertical: 'top' };

    // ── CREW & CLIENT CONTACTS ────────────────────────────────────────────
    sectionHdr('Crew & Client Contacts');
    if (contacts.length === 0) {
      const er = ws.addRow(['No contacts added.']); merge(er, 'A', 'F');
      er.height = 20;
      er.getCell(1).fill = mkFill(OWHITE);
      er.getCell(1).font = bodyFont(DARK, 10);
      er.getCell(1).alignment = { indent: 1, vertical: 'middle' };
    } else {
      // Header: A=Title B=Name C=Phone D=Email E+F=empty
      const ch = ws.addRow(['Title', 'Name', 'Phone', 'Email', '', '']);
      ws.mergeCells(`E${ch.number}:F${ch.number}`);
      ch.height = 22;
      for (let c = 1; c <= 6; c++) {
        ch.getCell(c).fill = mkFill(DARK);
        ch.getCell(c).font = wFont(10, true);
        ch.getCell(c).alignment = { vertical: 'middle', indent: 1 };
      }
      contacts.forEach((ct, idx) => {
        const bg = idx % 2 === 0 ? CREAM : OWHITE;
        const cr = ws.addRow([ct.title ?? '', ct.name ?? '', ct.phone ?? '', ct.email ?? '', '', '']);
        ws.mergeCells(`E${cr.number}:F${cr.number}`);
        cr.height = 20;
        for (let c = 1; c <= 6; c++) {
          cr.getCell(c).fill = mkFill(bg);
          cr.getCell(c).font = bodyFont(DARK, 10);
          cr.getCell(c).alignment = { vertical: 'middle', wrapText: true };
        }
      });
    }

    // ── LIGHT TIMES & WEATHER ─────────────────────────────────────────────
    dAlt = 0;
    sectionHdr('Light Times & Weather');
    detailRow('Sunrise', sheet.sunrise ?? '', 'Sunset', sheet.sunset ?? '');
    detailRow('Golden Hour AM', sheet.goldenHourAm ?? '', 'Golden Hour PM', sheet.goldenHourPm ?? '');
    detailRow('Blue Hour AM', sheet.blueHourAm ?? '', 'Blue Hour PM', sheet.blueHourPm ?? '');
    if (wd) {
      const temp = wd.tempMin != null && wd.tempMax != null
        ? `${wd.tempMin}° – ${wd.tempMax}°C`
        : wd.tempMax != null ? `${wd.tempMax}°C` : '';
      detailRow('Conditions', wd.description ?? '', 'Temperature', temp);
      detailRow('Precipitation', wd.precipitation != null ? `${wd.precipitation} mm` : '',
        'Wind Speed', wd.windSpeed != null ? `${wd.windSpeed} km/h` : '');
    }

    // ── DAILY LOGISTICS ───────────────────────────────────────────────────
    sectionHdr('Daily Logistics');
    const logLabels = ['Start of Day', 'Breakfast', 'Lunch', 'Dinner', 'End of Day'];
    const logVals   = [sheet.startOfDay, sheet.breakfastTime, sheet.lunchTime, sheet.dinnerTime, sheet.endOfDay];
    // Label row
    const ll = ws.addRow(logLabels.concat(['']));
    ll.height = 16;
    for (let c = 1; c <= 6; c++) {
      ll.getCell(c).fill = mkFill(CREAM);
      ll.getCell(c).font = bodyFont(MID, 9);
      ll.getCell(c).alignment = { horizontal: 'center', vertical: 'bottom' };
    }
    // Value row
    const lv = ws.addRow(logVals.map((v) => v ?? '').concat(['']));
    lv.height = 26;
    for (let c = 1; c <= 6; c++) {
      lv.getCell(c).fill = mkFill(OWHITE);
      lv.getCell(c).font = bodyFont(DARK, 10, true);
      lv.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
      lv.getCell(c).border = tanBorder();
    }

    // ── SHOT LIST ─────────────────────────────────────────────────────────
    sectionHdr('Shot List');
    const sh = ws.addRow(['#', 'Shooting Location', 'Description', 'Timing', 'Notes', '✓']);
    sh.height = 22;
    for (let c = 1; c <= 6; c++) {
      sh.getCell(c).fill = mkFill(DARK);
      sh.getCell(c).font = wFont(10, true);
      sh.getCell(c).alignment = { horizontal: c === 1 || c === 6 ? 'center' : 'left', vertical: 'middle' };
    }

    let prevLoc = '';
    sheet.shots.forEach((s, i) => {
      const showLoc = !!s.shootingLocation && s.shootingLocation !== prevLoc;
      if (s.shootingLocation) prevLoc = s.shootingLocation;
      const bg   = i % 2 === 0 ? CREAM : OWHITE;
      const done = s.status === 'DONE';
      const sr   = ws.addRow([
        i + 1,
        showLoc ? (s.shootingLocation ?? '') : '',
        s.description,
        s.timing ?? '',
        s.notes ?? '',
        done ? '✓' : '☐',
      ]);
      sr.height = 22;
      for (let c = 1; c <= 6; c++) {
        sr.getCell(c).fill = mkFill(bg);
        sr.getCell(c).border = tanBorder();
        sr.getCell(c).alignment = {
          horizontal: c === 1 || c === 6 ? 'center' : 'left',
          vertical: 'middle',
          wrapText: true,
        };
      }
      sr.getCell(1).font = bodyFont('999999', 9);
      sr.getCell(2).font = bodyFont(DARK, 10);
      sr.getCell(3).font = bodyFont(DARK, 10);
      sr.getCell(4).font = bodyFont(DARK, 10);
      sr.getCell(5).font = bodyFont(DARK, 10);
      sr.getCell(6).font = bodyFont(done ? MID : TAN, 10, done);
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

    const org = await prisma.organisation.findUnique({
      where: { id: sheet.organisationId },
      select: { logoUrl: true },
    });
    const logoUrl = org?.logoUrl ?? null;

    const contacts = (Array.isArray(sheet.contacts) ? sheet.contacts : []) as Array<{
      title?: string; name?: string; phone?: string; email?: string;
    }>;
    const wd = sheet.weatherData as { description?: string; tempMax?: number; tempMin?: number; precipitation?: number; windSpeed?: number } | null;

    // ── Brand colours ──────────────────────────────────────────────────────
    const DARK_BROWN = '#2C2318';
    const MID_BROWN  = '#7A5C3A';
    const WARM_TAN   = '#B89A7A';
    const CREAM      = '#F5F0EB';
    const OFF_WHITE  = '#FAFAF8';
    const GREY_TEXT  = '#999999';

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const M      = 24;           // margin
    const CW     = PAGE_W - M * 2;
    const FOOTER_RESERVE = 26;  // space kept clear at page bottom for footer

    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sheet.projectName.replace(/[^a-z0-9]/gi, '_')}_callsheet.pdf"`);
    doc.pipe(res);

    // ── HEADER (90 px, full page width) — cream bg so dark logo is visible ─
    doc.rect(0, 0, PAGE_W, 90).fill(CREAM);

    // Left: logo or fallback text
    let logoOk = false;
    if (logoUrl) {
      try {
        const m = logoUrl.match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/);
        if (m) {
          doc.image(Buffer.from(m[2], 'base64'), M, 22.5, { height: 45, fit: [160, 45] });
          logoOk = true;
        }
      } catch { /* skip */ }
    }
    if (!logoOk) {
      doc.fillColor(DARK_BROWN).fontSize(14).font('Helvetica-Bold')
        .text('JA PHOTOGRAPHY', M, 30, { width: 200, lineBreak: false });
    }

    // Right: project name / client / date + location
    const shootDate = sheet.shootingDate ? format(new Date(sheet.shootingDate), 'dd MMMM yyyy') : '';
    const dateLocStr = [shootDate, sheet.location ?? ''].filter(Boolean).join(' · ');
    doc.fillColor(DARK_BROWN).fontSize(13).font('Helvetica-Bold')
      .text(sheet.projectName, M, 18, { width: CW, align: 'right', lineBreak: false });
    doc.fillColor(DARK_BROWN).fontSize(10).font('Helvetica')
      .text(sheet.client ?? '', M, 40, { width: CW, align: 'right', lineBreak: false });
    if (dateLocStr) {
      doc.fillColor(DARK_BROWN).fontSize(10).font('Helvetica')
        .text(dateLocStr, M, 57, { width: CW, align: 'right', lineBreak: false });
    }

    // ── ACCENT BAR (4 px) ─────────────────────────────────────────────────
    doc.rect(0, 90, PAGE_W, 4).fill(WARM_TAN);

    let y = 104;

    const checkPage = (needed = 22) => {
      if (y + needed > PAGE_H - FOOTER_RESERVE - 8) {
        doc.addPage();
        y = M + 8;
      }
    };

    const sectionHeader = (title: string) => {
      y += 14;
      checkPage(24);
      doc.fillColor(MID_BROWN).fontSize(9).font('Helvetica-Bold')
        .text(title, M, y, { lineBreak: false });
      y += 13;
      doc.save().moveTo(M, y).lineTo(PAGE_W - M, y).lineWidth(0.5).strokeColor(WARM_TAN).stroke().restore();
      y += 6;
    };

    const detail2 = (l1: string, v1: string, l2 = '', v2 = '') => {
      checkPage(15);
      const hw = CW / 2;
      const lw = hw * 0.38;
      doc.fillColor(WARM_TAN).fontSize(8).font('Helvetica-Bold')
        .text(l1, M, y, { width: lw, lineBreak: false });
      doc.fillColor(DARK_BROWN).fontSize(9).font('Helvetica')
        .text(v1 || '—', M + lw, y, { width: hw - lw - 4, lineBreak: false });
      if (l2) {
        doc.fillColor(WARM_TAN).fontSize(8).font('Helvetica-Bold')
          .text(l2, M + hw, y, { width: lw, lineBreak: false });
        doc.fillColor(DARK_BROWN).fontSize(9).font('Helvetica')
          .text(v2 || '—', M + hw + lw, y, { width: hw - lw - 4, lineBreak: false });
      }
      y += 14;
    };

    // ── PROJECT DETAILS ───────────────────────────────────────────────────
    sectionHeader('PROJECT DETAILS');
    detail2('Client', sheet.client ?? '', 'Project Name', sheet.projectName);
    detail2('Location', sheet.location ?? '', 'Shooting Date', shootDate);
    if (sheet.generalNotes) {
      checkPage(36);
      const lw = CW * 0.3;
      doc.fillColor(WARM_TAN).fontSize(8).font('Helvetica-Bold')
        .text('General Notes', M, y, { width: lw, lineBreak: false });
      const approxLines = Math.max(2, Math.ceil(sheet.generalNotes.length / 110));
      doc.fillColor(DARK_BROWN).fontSize(9).font('Helvetica')
        .text(sheet.generalNotes, M + lw, y, { width: CW - lw - 4, lineBreak: true });
      y += approxLines * 11 + 4;
    }

    // ── CREW & CLIENT CONTACTS ────────────────────────────────────────────
    sectionHeader('CREW & CLIENT CONTACTS');
    if (contacts.length === 0) {
      doc.fillColor('#888888').fontSize(8).font('Helvetica')
        .text('No contacts added', M, y, { lineBreak: false });
      y += 14;
    } else {
      const cw  = [CW * 0.18, CW * 0.22, CW * 0.20, CW * 0.40];
      const cx  = cw.reduce<number[]>((a, w, i) => { a.push(i === 0 ? M : a[i-1] + cw[i-1]); return a; }, []);
      checkPage(22);
      doc.rect(M, y, CW, 20).fill(DARK_BROWN);
      ['Title', 'Name', 'Phone', 'Email'].forEach((h, i) => {
        doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
          .text(h, cx[i] + 4, y + 6, { width: cw[i] - 8, lineBreak: false });
      });
      y += 20;
      contacts.forEach((ct, idx) => {
        checkPage(18);
        doc.rect(M, y, CW, 18).fill(idx % 2 === 0 ? CREAM : OFF_WHITE);
        [ct.title ?? '', ct.name ?? '', ct.phone ?? '', ct.email ?? ''].forEach((v, j) => {
          doc.fillColor(DARK_BROWN).fontSize(8).font('Helvetica')
            .text(v, cx[j] + 4, y + 5, { width: cw[j] - 8, lineBreak: false });
        });
        y += 18;
      });
    }

    // ── LIGHT TIMES & WEATHER ─────────────────────────────────────────────
    sectionHeader('LIGHT TIMES & WEATHER');
    const hw = CW / 2;
    const llw = hw * 0.5;
    [
      ['Sunrise', sheet.sunrise ?? '', 'Sunset', sheet.sunset ?? ''],
      ['Golden Hour AM', sheet.goldenHourAm ?? '', 'Golden Hour PM', sheet.goldenHourPm ?? ''],
      ['Blue Hour AM', sheet.blueHourAm ?? '', 'Blue Hour PM', sheet.blueHourPm ?? ''],
    ].forEach(([l1, v1, l2, v2]) => {
      checkPage(14);
      doc.fillColor(WARM_TAN).fontSize(8).font('Helvetica-Bold').text(l1, M, y, { width: llw, lineBreak: false });
      doc.fillColor(DARK_BROWN).fontSize(9).font('Helvetica-Bold').text(v1 || '—', M + llw, y, { width: hw - llw - 4, lineBreak: false });
      doc.fillColor(WARM_TAN).fontSize(8).font('Helvetica-Bold').text(l2, M + hw, y, { width: llw, lineBreak: false });
      doc.fillColor(DARK_BROWN).fontSize(9).font('Helvetica-Bold').text(v2 || '—', M + hw + llw, y, { width: hw - llw - 4, lineBreak: false });
      y += 14;
    });
    if (wd) {
      y += 4;
      checkPage(14);
      const temp = wd.tempMin != null && wd.tempMax != null
        ? `${wd.tempMin}° – ${wd.tempMax}°C`
        : wd.tempMax != null ? `${wd.tempMax}°C` : '—';
      const wCols = [
        ['Conditions', wd.description ?? '—'],
        ['Temperature', temp],
        ['Precipitation', wd.precipitation != null ? `${wd.precipitation} mm` : '—'],
        ['Wind Speed', wd.windSpeed != null ? `${wd.windSpeed} km/h` : '—'],
      ] as const;
      const ww = CW / 4;
      wCols.forEach(([l, v], i) => {
        doc.fillColor(WARM_TAN).fontSize(8).font('Helvetica-Bold').text(l, M + i * ww, y, { width: ww * 0.48, lineBreak: false });
        doc.fillColor(DARK_BROWN).fontSize(9).font('Helvetica-Bold').text(v, M + i * ww + ww * 0.48, y, { width: ww * 0.52 - 4, lineBreak: false });
      });
      y += 14;
    }

    // ── DAILY LOGISTICS ───────────────────────────────────────────────────
    sectionHeader('DAILY LOGISTICS');
    const logItems = [
      { label: 'Start of Day', value: sheet.startOfDay },
      { label: 'Breakfast',    value: sheet.breakfastTime },
      { label: 'Lunch',        value: sheet.lunchTime },
      { label: 'Dinner',       value: sheet.dinnerTime },
      { label: 'End of Day',   value: sheet.endOfDay },
    ];
    const boxGap = 6;
    const boxW   = (CW - boxGap * (logItems.length - 1)) / logItems.length;
    const boxH   = 42;
    checkPage(boxH + 6);
    logItems.forEach((item, i) => {
      const bx = M + i * (boxW + boxGap);
      doc.save().rect(bx, y, boxW, boxH).lineWidth(0.75).strokeColor(WARM_TAN).stroke().restore();
      doc.fillColor(WARM_TAN).fontSize(7).font('Helvetica-Bold')
        .text(item.label, bx + 4, y + 7, { width: boxW - 8, align: 'center', lineBreak: false });
      if (item.value) {
        doc.fillColor(DARK_BROWN).fontSize(10).font('Helvetica-Bold')
          .text(item.value, bx + 4, y + 22, { width: boxW - 8, align: 'center', lineBreak: false });
      } else {
        doc.save().moveTo(bx + 8, y + 33).lineTo(bx + boxW - 8, y + 33).lineWidth(0.5).strokeColor('#CCCCCC').stroke().restore();
      }
    });
    y += boxH + 8;

    // ── SHOT LIST ─────────────────────────────────────────────────────────
    sectionHeader('SHOT LIST');
    const sCW  = [CW * 0.05, CW * 0.22, CW * 0.33, CW * 0.12, CW * 0.20, CW * 0.08];
    const sCX  = sCW.reduce<number[]>((a, w, i) => { a.push(i === 0 ? M : a[i-1] + sCW[i-1]); return a; }, []);
    checkPage(22);
    doc.rect(M, y, CW, 20).fill(DARK_BROWN);
    ['#', 'Shooting Location', 'Description', 'Timing', 'Notes', ''].forEach((h, i) => {
      doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
        .text(h, sCX[i] + 3, y + 6, { width: sCW[i] - 6, align: i === 0 ? 'center' : 'left', lineBreak: false });
    });
    y += 20;

    let prevLoc = '';
    sheet.shots.forEach((s, i) => {
      const showLoc = !!s.shootingLocation && s.shootingLocation !== prevLoc;
      if (s.shootingLocation) prevLoc = s.shootingLocation;

      const descLines  = Math.max(1, Math.ceil((s.description?.length ?? 0) / 52));
      const notesLines = Math.max(1, Math.ceil((s.notes?.length ?? 0) / 32));
      const rowH = Math.max(18, Math.max(descLines, notesLines) * 11 + 8);

      checkPage(rowH);
      doc.rect(M, y, CW, rowH).fill(i % 2 === 0 ? CREAM : OFF_WHITE);
      doc.save().moveTo(M, y + rowH).lineTo(M + CW, y + rowH).lineWidth(0.25).strokeColor(WARM_TAN).stroke().restore();

      // # — row number
      doc.fillColor(GREY_TEXT).fontSize(8).font('Helvetica')
        .text(String(i + 1), sCX[0] + 2, y + 5, { width: sCW[0] - 4, align: 'center', lineBreak: false });
      // Location (suppressed when same as previous)
      if (showLoc) {
        doc.fillColor(DARK_BROWN).fontSize(8).font('Helvetica')
          .text(s.shootingLocation!, sCX[1] + 3, y + 5, { width: sCW[1] - 6, lineBreak: true, height: rowH - 8 });
      }
      // Description
      doc.fillColor(DARK_BROWN).fontSize(8).font('Helvetica')
        .text(s.description || '', sCX[2] + 3, y + 5, { width: sCW[2] - 6, lineBreak: true, height: rowH - 8 });
      // Timing
      doc.fillColor(DARK_BROWN).fontSize(8).font('Helvetica')
        .text(s.timing ?? '', sCX[3] + 3, y + 5, { width: sCW[3] - 6, lineBreak: false });
      // Notes
      doc.fillColor(DARK_BROWN).fontSize(8).font('Helvetica')
        .text(s.notes ?? '', sCX[4] + 3, y + 5, { width: sCW[4] - 6, lineBreak: true, height: rowH - 8 });
      // Status — drawn checkmark or hollow box
      if (s.status === 'DONE') {
        const cx = sCX[5] + sCW[5] / 2;
        const cy = y + rowH / 2;
        doc.save().strokeColor(MID_BROWN).lineWidth(1.5)
          .moveTo(cx - 4, cy).lineTo(cx - 1, cy + 3).lineTo(cx + 4, cy - 4).stroke().restore();
      } else {
        const bsz = 8;
        const bx  = sCX[5] + (sCW[5] - bsz) / 2;
        const by  = y + (rowH - bsz) / 2;
        doc.save().rect(bx, by, bsz, bsz).lineWidth(0.75).strokeColor(WARM_TAN).stroke().restore();
      }
      y += rowH;
    });

    // ── FOOTERS on every page ─────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    const fY = PAGE_H - 16;
    for (let p = 0; p < range.count; p++) {
      doc.switchToPage(p);
      doc.save().moveTo(M, fY - 5).lineTo(PAGE_W - M, fY - 5).lineWidth(0.5).strokeColor(WARM_TAN).stroke().restore();
      const leftTxt = [sheet.projectName, shootDate].filter(Boolean).join(' · ');
      doc.fillColor(GREY_TEXT).fontSize(7).font('Helvetica')
        .text(leftTxt, M, fY, { width: CW / 2, lineBreak: false });
      doc.fillColor(GREY_TEXT).fontSize(7).font('Helvetica')
        .text(`Page ${p + 1} of ${range.count}`, M + CW / 2, fY, { width: CW / 2, align: 'right', lineBreak: false });
    }

    doc.flushPages();
    doc.end();
  } catch (err) {
    console.error('PDF export error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

export default router;
