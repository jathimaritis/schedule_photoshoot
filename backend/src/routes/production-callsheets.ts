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
  const whereClause = { organisationId: req.user!.organisationId };
  console.log('[callsheets/list] user.email:', req.user!.email);
  console.log('[callsheets/list] user.organisationId:', req.user!.organisationId);
  console.log('[callsheets/list] where clause:', JSON.stringify(whereClause));
  const sheets = await prisma.productionCallSheet.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { shots: true } } },
  });
  console.log('[callsheets/list] results count:', sheets.length);
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

    const contacts = (Array.isArray(sheet.contacts) ? sheet.contacts : []) as Array<{
      title?: string; name?: string; phone?: string; email?: string;
    }>;
    const wd = sheet.weatherData as { description?: string; tempMax?: number; tempMin?: number; precipitation?: number; windSpeed?: number } | null;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Photoshoot Scheduler';
    const NAVY = '1A1A2E';
    const PURPLE = '2C2C54';
    const LIGHT = 'F2F2F2';
    const STRIPE = 'FAFAFA';

    // Helpers
    const fill = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } });
    // wfont: white bold (for headers); bfont: dark regular/bold (for body)
    const wfont = (sz = 12): Partial<ExcelJS.Font> => ({ name: 'Calibri', size: sz, color: { argb: 'FFFFFFFF' }, bold: true });
    const bfont = (sz = 11, bold = false): Partial<ExcelJS.Font> => ({ name: 'Calibri', size: sz, color: { argb: 'FF1A1A1A' }, bold });

    // Single worksheet, 5 columns: Label(A) | Value(B) | Label2(C) | Value2(D) | Status/Extra(E)
    const ws = wb.addWorksheet('Call Sheet');
    ws.columns = [{ width: 22 }, { width: 30 }, { width: 18 }, { width: 28 }, { width: 14 }];

    // Fit to 1 page wide when printed
    ws.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: 'landscape' };

    // ── Title bar ──────────────────────────────────────────────────────────
    const titleRow = ws.addRow([`${sheet.projectName} — PRODUCTION CALL SHEET`]);
    ws.mergeCells(`A${titleRow.number}:E${titleRow.number}`);
    titleRow.getCell(1).fill = fill(NAVY);
    titleRow.getCell(1).font = wfont(15);
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 36;
    ws.addRow([]); // spacer

    // ── Section header helper ──────────────────────────────────────────────
    const sectionHeader = (label: string) => {
      ws.addRow([]);
      const r = ws.addRow([label]);
      ws.mergeCells(`A${r.number}:E${r.number}`);
      r.getCell(1).fill = fill(PURPLE);
      r.getCell(1).font = wfont(12);
      r.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      r.height = 24;
    };

    // ── Pair row helper (label1 | value1 | label2 | value2) ───────────────
    const pairRow = (l1: string, v1: string, l2 = '', v2 = '', stripe = false) => {
      const r = ws.addRow([l1, v1, l2, v2, '']);
      r.getCell(1).fill = fill(LIGHT); r.getCell(1).font = bfont(11, true);
      r.getCell(2).font = bfont(11); r.getCell(2).alignment = { wrapText: false };
      if (l2) {
        r.getCell(3).fill = fill(LIGHT); r.getCell(3).font = bfont(11, true);
        r.getCell(4).font = bfont(11);
      }
      if (stripe) {
        r.getCell(2).fill = fill(STRIPE);
        r.getCell(4).fill = fill(STRIPE);
        r.getCell(5).fill = fill(STRIPE);
      }
      r.height = 22;
      return r;
    };

    // ── PROJECT DETAILS ───────────────────────────────────────────────────
    sectionHeader('PROJECT DETAILS');
    pairRow('Client', sheet.client ?? '', 'Project Name', sheet.projectName);
    pairRow('Location', sheet.location ?? '', 'Shooting Date',
      sheet.shootingDate ? format(new Date(sheet.shootingDate), 'dd MMMM yyyy') : '');

    // General Notes — full-width, tall, wrapped
    const notesRow = ws.addRow(['General Notes', sheet.generalNotes ?? '', '', '', '']);
    ws.mergeCells(`B${notesRow.number}:E${notesRow.number}`);
    notesRow.getCell(1).fill = fill(LIGHT); notesRow.getCell(1).font = bfont(11, true);
    notesRow.getCell(1).alignment = { vertical: 'top' };
    notesRow.getCell(2).font = bfont(11);
    notesRow.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    notesRow.height = 72; // ~96px — tall enough for multi-line notes

    // ── CREW & CLIENT CONTACTS ────────────────────────────────────────────
    sectionHeader('CREW & CLIENT CONTACTS');
    if (contacts.length === 0) {
      const er = ws.addRow(['No contacts added.', '', '', '', '']);
      ws.mergeCells(`A${er.number}:E${er.number}`);
      er.getCell(1).font = bfont(11); er.height = 22;
    } else {
      // Column header
      const ch = ws.addRow(['Title', 'Name', 'Phone', 'Email', '']);
      ws.mergeCells(`D${ch.number}:E${ch.number}`);
      for (let c = 1; c <= 4; c++) {
        ch.getCell(c).fill = fill('3C3C64');
        ch.getCell(c).font = wfont(11);
        ch.getCell(c).alignment = { horizontal: 'center' };
      }
      ch.height = 22;
      contacts.forEach((ct, i) => {
        const r = ws.addRow([ct.title ?? '', ct.name ?? '', ct.phone ?? '', ct.email ?? '', '']);
        ws.mergeCells(`D${r.number}:E${r.number}`);
        const bg = i % 2 === 0 ? 'FFFFFF' : STRIPE;
        for (let c = 1; c <= 4; c++) { r.getCell(c).fill = fill(bg); r.getCell(c).font = bfont(11); }
        r.height = 20;
      });
    }

    // ── LIGHT TIMES & WEATHER ─────────────────────────────────────────────
    sectionHeader('LIGHT TIMES & WEATHER');
    pairRow('Sunrise', sheet.sunrise ?? '', 'Sunset', sheet.sunset ?? '');
    pairRow('Golden Hour AM', sheet.goldenHourAm ?? '', 'Golden Hour PM', sheet.goldenHourPm ?? '');
    pairRow('Blue Hour AM', sheet.blueHourAm ?? '', 'Blue Hour PM', sheet.blueHourPm ?? '');
    if (wd) {
      const temp = wd.tempMin != null && wd.tempMax != null
        ? `${wd.tempMin}° – ${wd.tempMax}°C`
        : wd.tempMax != null ? `${wd.tempMax}°C` : '';
      pairRow('Conditions', wd.description ?? '', 'Temperature', temp, true);
      pairRow('Precipitation', wd.precipitation != null ? `${wd.precipitation} mm` : '',
        'Wind Speed', wd.windSpeed != null ? `${wd.windSpeed} km/h` : '');
    }

    // ── DAILY LOGISTICS ───────────────────────────────────────────────────
    sectionHeader('DAILY LOGISTICS');
    pairRow('Start of Day', sheet.startOfDay ?? '', 'End of Day', sheet.endOfDay ?? '');
    pairRow('Breakfast', sheet.breakfastTime ?? '', 'Lunch', sheet.lunchTime ?? '');
    pairRow('Dinner', sheet.dinnerTime ?? '', '', '');

    // ── SHOT LIST ─────────────────────────────────────────────────────────
    sectionHeader('SHOT LIST');
    const sh = ws.addRow(['Shooting Location', 'Shot Description', 'Timing', 'Notes', 'Done']);
    for (let c = 1; c <= 5; c++) {
      sh.getCell(c).fill = fill('3C3C64');
      sh.getCell(c).font = wfont(11);
      sh.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
    }
    sh.height = 22;
    sheet.shots.forEach((s, i) => {
      const doneSymbol = s.status === 'DONE' ? '✓' : '☐';
      const r = ws.addRow([s.shootingLocation ?? '', s.description, s.timing ?? '', s.notes ?? '', doneSymbol]);
      const bg = i % 2 === 0 ? 'FFFFFF' : STRIPE;
      for (let c = 1; c <= 5; c++) {
        r.getCell(c).fill = fill(bg);
        r.getCell(c).font = bfont(11);
        r.getCell(c).alignment = { wrapText: c === 4, horizontal: c === 5 ? 'center' : 'left', vertical: 'middle' };
      }
      r.height = 20;
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

    const contacts = (Array.isArray(sheet.contacts) ? sheet.contacts : []) as Array<{
      title?: string; name?: string; phone?: string; email?: string;
    }>;
    const wd = sheet.weatherData as { description?: string; tempMax?: number; tempMin?: number; precipitation?: number; windSpeed?: number } | null;

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sheet.projectName.replace(/[^a-z0-9]/gi, '_')}_callsheet.pdf"`);
    doc.pipe(res);

    const NAVY_RGB = [26, 26, 46] as const;
    const GOLD_RGB = [212, 175, 55] as const;
    const GREY_RGB = [240, 240, 240] as const;
    const PURPLE_RGB = [44, 44, 84] as const;

    const pageW = doc.page.width - 80;

    // Title bar
    doc.rect(40, 40, pageW, 30).fill(`rgb(${NAVY_RGB.join(',')})`);
    doc.fillColor(`rgb(${GOLD_RGB.join(',')})`).fontSize(14).font('Helvetica-Bold')
      .text(sheet.projectName.toUpperCase() + ' — PRODUCTION CALL SHEET', 40, 48, { width: pageW, align: 'center' });

    let y = 80;

    const checkPage = (needed = 24) => {
      if (y + needed > doc.page.height - 50) { doc.addPage(); y = 40; }
    };

    const section = (title: string) => {
      checkPage(26);
      doc.rect(40, y, pageW, 18).fill(`rgb(${PURPLE_RGB.join(',')})`);
      doc.fillColor('white').fontSize(9).font('Helvetica-Bold').text(title, 44, y + 4);
      y += 22;
    };

    const row2col = (l1: string, v1: string, l2: string, v2: string) => {
      checkPage();
      const hw = pageW / 2;
      doc.rect(40, y, hw, 16).fill(`rgb(${GREY_RGB.join(',')})`);
      doc.rect(40 + hw, y, hw, 16).fill('white');
      doc.fillColor('#222').fontSize(8).font('Helvetica-Bold').text(l1, 44, y + 3, { width: hw * 0.4 });
      doc.fillColor('#333').font('Helvetica').text(v1, 44 + hw * 0.4, y + 3, { width: hw * 0.6 - 4 });
      doc.fillColor('#222').font('Helvetica-Bold').text(l2, 44 + hw, y + 3, { width: hw * 0.4 });
      doc.fillColor('#333').font('Helvetica').text(v2, 44 + hw + hw * 0.4, y + 3, { width: hw * 0.6 - 4 });
      y += 18;
    };

    const row1col = (label: string, value: string, tallH = 16) => {
      checkPage(tallH + 2);
      doc.rect(40, y, pageW, tallH).fill(`rgb(${GREY_RGB.join(',')})`);
      doc.fillColor('#222').fontSize(8).font('Helvetica-Bold').text(label, 44, y + 3, { width: pageW * 0.22 });
      doc.fillColor('#333').font('Helvetica').text(value, 44 + pageW * 0.22, y + 3,
        { width: pageW * 0.78 - 4, lineBreak: tallH > 16, height: tallH - 6 });
      y += tallH + 2;
    };

    // Project details
    section('PROJECT DETAILS');
    row2col('Client', sheet.client ?? '', 'Project Name', sheet.projectName);
    row1col('Location', sheet.location ?? '');
    row2col('Shooting Date', sheet.shootingDate ? format(new Date(sheet.shootingDate), 'dd MMMM yyyy') : '', '', '');
    if (sheet.generalNotes) row1col('General Notes', sheet.generalNotes, 48);
    y += 6;

    // Contacts
    if (contacts.length > 0) {
      section('CREW & CLIENT CONTACTS');
      // Header
      const cw = [pageW * 0.22, pageW * 0.24, pageW * 0.2, pageW * 0.34];
      const cx = [40, 40 + cw[0], 40 + cw[0] + cw[1], 40 + cw[0] + cw[1] + cw[2]];
      doc.rect(40, y, pageW, 15).fill(`rgb(${PURPLE_RGB.join(',')})`);
      ['Title', 'Name', 'Phone', 'Email'].forEach((h, i) => {
        doc.fillColor('white').fontSize(7.5).font('Helvetica-Bold')
          .text(h, cx[i] + 2, y + 3, { width: cw[i] - 4, align: 'left' });
      });
      y += 17;
      contacts.forEach((ct, i) => {
        checkPage();
        doc.rect(40, y, pageW, 15).fill(i % 2 === 0 ? 'white' : `rgb(${GREY_RGB.join(',')})`);
        [ct.title ?? '', ct.name ?? '', ct.phone ?? '', ct.email ?? ''].forEach((v, j) => {
          doc.fillColor('#333').fontSize(7.5).font('Helvetica')
            .text(v, cx[j] + 2, y + 3, { width: cw[j] - 4, lineBreak: false });
        });
        y += 16;
      });
      y += 6;
    }

    // Light & weather
    section('LIGHT TIMES & WEATHER');
    row2col('Sunrise', sheet.sunrise ?? '', 'Sunset', sheet.sunset ?? '');
    row2col('Golden Hour AM', sheet.goldenHourAm ?? '', 'Golden Hour PM', sheet.goldenHourPm ?? '');
    row2col('Blue Hour AM', sheet.blueHourAm ?? '', 'Blue Hour PM', sheet.blueHourPm ?? '');
    if (wd) {
      const temp = wd.tempMin != null && wd.tempMax != null
        ? `${wd.tempMin}° – ${wd.tempMax}°C`
        : wd.tempMax != null ? `${wd.tempMax}°C` : '';
      row2col('Conditions', wd.description ?? '', 'Temperature', temp);
      row2col('Precipitation', wd.precipitation != null ? `${wd.precipitation} mm` : '',
        'Wind Speed', wd.windSpeed != null ? `${wd.windSpeed} km/h` : '');
    }
    y += 6;

    // Logistics
    section('DAILY LOGISTICS');
    row2col('Start of Day', sheet.startOfDay ?? '', 'End of Day', sheet.endOfDay ?? '');
    row2col('Breakfast', sheet.breakfastTime ?? '', 'Lunch', sheet.lunchTime ?? '');
    if (sheet.dinnerTime) row2col('Dinner', sheet.dinnerTime, '', '');
    y += 6;

    // Shot list
    section('SHOT LIST');
    const cols = [pageW * 0.21, pageW * 0.33, pageW * 0.1, pageW * 0.28, pageW * 0.08];
    const colX = cols.reduce<number[]>((acc, _, i) => {
      acc.push(i === 0 ? 40 : acc[i - 1] + cols[i - 1]);
      return acc;
    }, []);
    const hdrs = ['Shooting Location', 'Description', 'Timing', 'Notes', 'Done'];
    checkPage();
    doc.rect(40, y, pageW, 16).fill(`rgb(${PURPLE_RGB.join(',')})`);
    hdrs.forEach((h, i) => {
      doc.fillColor('white').fontSize(7.5).font('Helvetica-Bold')
        .text(h, colX[i] + 2, y + 4, { width: cols[i] - 4, align: i === 4 ? 'center' : 'center' });
    });
    y += 18;

    const drawCheckbox = (cx: number, cy: number, done: boolean) => {
      const boxSize = 7;
      const bx = cx + (cols[4] - boxSize) / 2; // centre in column
      const by = cy + (16 - boxSize) / 2;
      doc.save();
      doc.lineWidth(0.75);
      doc.rect(bx, by, boxSize, boxSize).stroke('#555');
      if (done) {
        // Checkmark: ╲ from top-left-ish to middle-bottom, then up-right to top-right-ish
        doc.moveTo(bx + 1, by + 3.5)
           .lineTo(bx + 3, by + 6)
           .lineTo(bx + 6, by + 1)
           .stroke('#1a1a2e');
      }
      doc.restore();
    };

    sheet.shots.forEach((s, i) => {
      checkPage(18);
      doc.rect(40, y, pageW, 16).fill(i % 2 === 0 ? 'white' : `rgb(${GREY_RGB.join(',')})`);
      // Text columns (0-3)
      [s.shootingLocation ?? '', s.description, s.timing ?? '', s.notes ?? ''].forEach((v, j) => {
        doc.fillColor('#333').fontSize(7.5).font('Helvetica')
          .text(v, colX[j] + 2, y + 4, { width: cols[j] - 4, lineBreak: false });
      });
      // Checkbox column (4)
      drawCheckbox(colX[4], y, s.status === 'DONE');
      y += 16;
    });

    doc.end();
  } catch (err) {
    console.error('PDF export error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

export default router;
