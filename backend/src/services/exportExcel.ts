import ExcelJS from 'exceljs';
import { format } from 'date-fns';

// Schedule sheet colours (unchanged)
const NAVY = '1A1A2E';
const GOLD = 'D4AF37';
const INDIGO = '2C2C54';
const DAY_HDR = '2A3A5C';
const LIGHT_GREY = 'F0F0F0';
const OFF_WHITE = 'FAFAFA';
const BORDER_GREY = 'D0D0D0';
const BODY_TEXT = '1A1A1A';

// Brand palette (call sheet)
const BRAND_DARK    = '2C2318';
const BRAND_MID     = '7A5C3A';
const BRAND_TAN     = 'B89A7A';
const BRAND_CREAM   = 'F5F0EB';
const BRAND_OFFWHITE = 'FAFAF8';
const BRAND_WHITE   = 'FFFFFF';

function hex(color: string): string {
  return color.startsWith('#') ? color.slice(1) : color;
}

function fill(fgColor: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex(fgColor)}` } };
}

function border(color = BORDER_GREY): Partial<ExcelJS.Borders> {
  const s = { style: 'thin' as const, color: { argb: `FF${color}` } };
  return { bottom: s };
}

function font(opts: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> {
  return { name: 'Calibri', size: 10, color: { argb: `FF${BODY_TEXT}` }, ...opts };
}

function wfont(opts: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> {
  return font({ color: { argb: 'FFFFFFFF' }, ...opts });
}

export async function buildScheduleWorkbook(project: ScheduleProject): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Photoshoot Scheduler';

  await addSummarySheet(wb, project);
  await addScheduleSheet(wb, project);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function buildAllCallSheetsWorkbook(project: ScheduleProject): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Photoshoot Scheduler';
  let added = false;
  for (const day of project.shootingDays) {
    const cs = project.callSheets.find((c) => c.shootingDayId === day.id);
    if (cs) { addCallSheetSheet(wb, project, day, cs); added = true; }
  }
  if (!added) {
    const ws = wb.addWorksheet('Call Sheets');
    ws.addRow(['No call sheets have been created yet.']);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function buildSingleCallSheetWorkbook(project: ScheduleProject, dayId: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Photoshoot Scheduler';
  const day = project.shootingDays.find((d) => d.id === dayId);
  const cs = project.callSheets.find((c) => c.shootingDayId === dayId);
  if (day && cs) {
    addCallSheetSheet(wb, project, day, cs);
  } else {
    const ws = wb.addWorksheet('Call Sheet');
    ws.addRow(['Call sheet not found.']);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function addSummarySheet(wb: ExcelJS.Workbook, project: ScheduleProject) {
  const ws = wb.addWorksheet('Summary');
  ws.columns = [{ width: 30 }, { width: 30 }, { width: 20 }, { width: 20 }];

  const addRow = (vals: unknown[], bg?: string, bold?: boolean, textColor?: string) => {
    const row = ws.addRow(vals);
    if (bg) row.eachCell((cell) => { cell.fill = fill(bg); });
    if (textColor) row.eachCell((cell) => { cell.font = font({ color: { argb: `FF${hex(textColor)}` }, bold: bold ?? false }); });
    else if (bold) row.eachCell((cell) => { cell.font = font({ bold: true }); });
    return row;
  };

  // Logo (if provided)
  if (project.logoUrl) {
    try {
      const dataUrlMatch = project.logoUrl.match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/);
      if (dataUrlMatch) {
        const ext = dataUrlMatch[1] === 'webp' ? 'png' : dataUrlMatch[1] as 'png' | 'jpeg' | 'gif';
        const base64 = dataUrlMatch[2];
        const imageId = wb.addImage({ base64, extension: ext });
        ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 50 } });
        ws.addRow([]);
        ws.addRow([]);
      }
    } catch {
      // skip logo if embedding fails
    }
  }

  // Title
  const titleRow = ws.addRow([`${project.name} — PHOTOSHOOT SCHEDULE`]);
  ws.mergeCells(`A${titleRow.number}:D${titleRow.number}`);
  titleRow.getCell(1).fill = fill(NAVY);
  titleRow.getCell(1).font = wfont({ bold: true, size: 14 });
  titleRow.getCell(1).alignment = { horizontal: 'center' };
  titleRow.height = 30;

  ws.addRow([]);

  // Overview table
  addRow(['PROJECT OVERVIEW', '', '', ''], INDIGO, true, 'FFFFFF');
  addRow(['Project Name', project.name, 'Client', project.clientName ?? '']);
  addRow(['Location', project.location ?? '', 'Status', project.status]);
  if (project.startDate) addRow(['Start Date', format(new Date(project.startDate), 'dd MMM yyyy'), 'End Date', project.endDate ? format(new Date(project.endDate), 'dd MMM yyyy') : '']);
  addRow(['Total Shooting Days', project.shootingDays.length.toString(), 'Total Shots', project.totalShots?.toString() ?? '']);

  ws.addRow([]);

  // Photography breakdown
  addRow(['PHOTOGRAPHY BREAKDOWN', 'DAYS', 'DATES', 'SHOTS'], INDIGO, true, 'FFFFFF');
  for (const type of project.photographyTypes) {
    const typeDays = project.shootingDays.filter((d) => d.photographyTypeId === type.id);
    const dates = typeDays.map((d) => format(new Date(d.calendarDate), 'dd MMM')).join(', ');
    const row = ws.addRow([type.name, typeDays.length, dates, '']);
    row.getCell(1).fill = fill(type.hexColour);
    row.getCell(1).font = wfont({ bold: true });
    row.getCell(2).fill = fill(type.hexColour);
    row.getCell(2).font = wfont();
    row.getCell(3).fill = fill(type.hexColour);
    row.getCell(3).font = wfont();
    row.getCell(4).fill = fill(type.hexColour);
    row.getCell(4).font = wfont();
  }
}

async function addScheduleSheet(wb: ExcelJS.Workbook, project: ScheduleProject) {
  const ws = wb.addWorksheet('Schedule');
  const days = project.shootingDays;
  const totalCols = 2 + days.length;

  // Column widths
  ws.getColumn(1).width = 36;
  ws.getColumn(2).width = 12;
  for (let i = 3; i <= totalCols; i++) ws.getColumn(i).width = 12;

  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 10 }];

  // Row 1: navy spacer
  const r1 = ws.addRow(Array(totalCols).fill(''));
  r1.eachCell((c) => { c.fill = fill(NAVY); });
  r1.height = 8;

  // Row 2: title
  const r2 = ws.addRow([`${project.name.toUpperCase()} — PHOTOSHOOT SCHEDULE`, ...Array(totalCols - 1).fill('')]);
  ws.mergeCells(`A2:${colLetter(totalCols)}2`);
  r2.getCell(1).fill = fill(NAVY);
  r2.getCell(1).font = wfont({ bold: true, size: 14, color: { argb: `FF${GOLD}` } });
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  r2.height = 28;

  // Row 3: subtitle
  const r3 = ws.addRow([`${project.clientName ?? ''} | ${project.location ?? ''}`, ...Array(totalCols - 1).fill('')]);
  ws.mergeCells(`A3:${colLetter(totalCols)}3`);
  r3.getCell(1).fill = fill('FFFFFF');
  r3.getCell(1).font = font({ italic: true, color: { argb: 'FF888888' } });
  r3.getCell(1).alignment = { horizontal: 'center' };
  r3.height = 18;

  // Row 4: spacer
  ws.addRow([]);

  // Row 5: legend
  const r5 = ws.addRow(['PHOTOGRAPHY TYPES:', ...Array(totalCols - 1).fill('')]);
  r5.getCell(1).font = font({ bold: true });
  let legendCol = 2;
  for (const t of project.photographyTypes) {
    r5.getCell(legendCol).value = `  ${t.name}  `;
    r5.getCell(legendCol).fill = fill(t.hexColour);
    r5.getCell(legendCol).font = wfont({ bold: true });
    legendCol++;
    if (legendCol > totalCols) break;
  }
  r5.height = 18;

  // Rows 6-7: spacers
  ws.addRow([]);
  ws.addRow([]);

  // Row 8: phase bands
  const r8 = ws.addRow(['', '', ...days.map((d) => d.photographyType?.name?.toUpperCase() ?? '')]);
  let bandStart = 3;
  for (let i = 0; i < days.length; i++) {
    const col = i + 3;
    const typeId = days[i].photographyTypeId;
    const type = project.photographyTypes.find((t) => t.id === typeId);
    if (type) {
      r8.getCell(col).fill = fill(type.hexColour);
      r8.getCell(col).font = wfont({ bold: true });
    }
  }
  r8.height = 18;

  // Row 9: category spans (just type names per day)
  const r9 = ws.addRow(['SHOT / LOCATION', 'TIMING', ...days.map((d) => d.label ?? `Day ${d.dayNumber}`)]);
  r9.getCell(1).fill = fill(DAY_HDR);
  r9.getCell(1).font = wfont({ bold: true });
  r9.getCell(2).fill = fill(DAY_HDR);
  r9.getCell(2).font = wfont({ bold: true });
  for (let i = 0; i < days.length; i++) {
    const col = i + 3;
    const type = project.photographyTypes.find((t) => t.id === days[i].photographyTypeId);
    r9.getCell(col).fill = fill(type?.hexColour ?? DAY_HDR);
    r9.getCell(col).font = wfont({ bold: true });
    r9.getCell(col).alignment = { horizontal: 'center' };
  }
  r9.height = 18;

  // Row 10: date headers
  const r10 = ws.addRow(['', '', ...days.map((d) => format(new Date(d.calendarDate), 'dd MMM'))]);
  r10.getCell(1).fill = fill(DAY_HDR);
  r10.getCell(2).fill = fill(DAY_HDR);
  for (let i = 0; i < days.length; i++) {
    const col = i + 3;
    const type = project.photographyTypes.find((t) => t.id === days[i].photographyTypeId);
    r10.getCell(col).fill = fill(type?.hexColour ?? DAY_HDR);
    r10.getCell(col).font = wfont({ bold: true });
    r10.getCell(col).alignment = { horizontal: 'center' };
    r10.getCell(col).value = `Day ${days[i].dayNumber}\n${format(new Date(days[i].calendarDate), 'dd MMM')}`;
    r10.getCell(col).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  r10.height = 28;

  // Data rows
  let rowIdx = 11;
  let sectionLevel = 1;

  for (const section of project.sections) {
    // Section header
    const sRow = ws.addRow([section.name.toUpperCase(), '', ...Array(days.length).fill('')]);
    ws.mergeCells(`A${rowIdx}:${colLetter(totalCols)}${rowIdx}`);
    sRow.getCell(1).fill = fill(INDIGO);
    sRow.getCell(1).font = wfont({ bold: true, size: 11 });
    sRow.height = 20;
    sRow.outlineLevel = 0;
    rowIdx++;

    for (const cat of section.categories) {
      const type = project.photographyTypes.find((t) => t.id === cat.photographyTypeId);
      const catColour = type?.hexColour ?? INDIGO;

      // Category header
      const cRow = ws.addRow([cat.name, '', ...Array(days.length).fill('')]);
      ws.mergeCells(`A${rowIdx}:${colLetter(totalCols)}${rowIdx}`);
      cRow.getCell(1).fill = fill(catColour);
      cRow.getCell(1).font = wfont({ bold: true });
      cRow.height = 18;
      cRow.outlineLevel = 1;
      rowIdx++;

      for (const loc of cat.locations) {
        // Location row
        const lRow = ws.addRow([loc.name, '', ...Array(days.length).fill('')]);
        lRow.getCell(1).fill = fill(LIGHT_GREY);
        lRow.getCell(1).font = font({ bold: true });
        lRow.getCell(1).border = border();
        lRow.height = 18;
        lRow.outlineLevel = 2;
        rowIdx++;

        let shotIdx = 0;
        for (const shot of loc.shots) {
          const bg = shotIdx % 2 === 0 ? 'FFFFFF' : OFF_WHITE;
          const shotRow = ws.addRow([
            shot.description,
            shot.timing ?? '',
            ...days.map((d) => {
              const assigned = shot.dayAssignments?.find((a) => a.shootingDayId === d.id);
              return assigned ? '✓' : '';
            }),
          ]);
          shotRow.getCell(1).fill = fill(bg);
          shotRow.getCell(1).font = font();
          shotRow.getCell(1).border = border();
          shotRow.getCell(2).fill = fill(bg);
          shotRow.getCell(2).font = font();
          shotRow.getCell(2).border = border();

          for (let di = 0; di < days.length; di++) {
            const col = di + 3;
            const cell = shotRow.getCell(col);
            const assigned = shot.dayAssignments?.find((a) => a.shootingDayId === days[di].id);
            if (assigned) {
              const tickType = project.photographyTypes.find((t) => t.id === days[di].photographyTypeId);
              const colour = shot.tickColourOverride ?? assigned.tickColour ?? tickType?.hexColour ?? catColour;
              cell.fill = fill(colour);
              cell.font = wfont({ bold: true });
              cell.value = '✓';
            } else {
              cell.fill = fill(LIGHT_GREY);
            }
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = border();
          }

          shotRow.height = 16;
          shotRow.outlineLevel = 3;
          shotIdx++;
          rowIdx++;
        }
      }
    }
  }

  ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };
}

function addCallSheetSheet(wb: ExcelJS.Workbook, project: ScheduleProject, day: ShootingDayData, cs: CallSheetData) {
  const ws = wb.addWorksheet(`Day ${day.dayNumber}`);

  // ── Column widths ─────────────────────────────────────────────────────────
  ws.columns = [
    { width: 6 },   // A: # / label
    { width: 28 },  // B: description / value
    { width: 22 },  // C: location / label
    { width: 14 },  // D: timing / label
    { width: 22 },  // E: notes / value
    { width: 10 },  // F: status / spacer
  ];

  // ── Print settings ────────────────────────────────────────────────────────
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, showGridLines: false };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // ── Helpers ───────────────────────────────────────────────────────────────
  const c = (hex: string): string => `FF${hex.replace('#', '')}`;
  const bg = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c(hex) } });
  const f = (size: number, color: string, bold = false, italic = false): Partial<ExcelJS.Font> =>
    ({ name: 'Calibri', size, bold, italic, color: { argb: c(color) } });

  // Write to all 6 cells of a row without merging.
  const setRow = (
    row: ExcelJS.Row,
    cells: [unknown, unknown, unknown, unknown, unknown, unknown],
    bgCol: string,
    fontSpec: Partial<ExcelJS.Font>,
    height: number,
    wrap = false,
  ) => {
    row.height = height;
    cells.forEach((val, i) => {
      const cell = row.getCell(i + 1);
      cell.value = val as ExcelJS.CellValue;
      cell.fill  = bg(bgCol);
      cell.font  = fontSpec;
      if (wrap) cell.alignment = { wrapText: true, vertical: 'top' };
    });
  };

  // Merge a row A:F (only for purely decorative rows with a single value in A).
  const mergeRow = (row: ExcelJS.Row, rowNum: number) => ws.mergeCells(`A${rowNum}:F${rowNum}`);

  let rowNum = 1;

  // ── Row 1: empty cream spacer (logo will overlay here) ───────────────────
  const row1 = ws.addRow(['', '', '', '', '', '']);
  mergeRow(row1, rowNum++);
  row1.height = 40;
  row1.getCell(1).fill = bg(BRAND_CREAM);

  // ── Row 2: Project name ───────────────────────────────────────────────────
  const row2 = ws.addRow([project.name, '', '', '', '', '']);
  mergeRow(row2, rowNum++);
  row2.height = 24;
  row2.getCell(1).fill = bg(BRAND_CREAM);
  row2.getCell(1).font = f(14, BRAND_DARK, true);
  row2.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  // ── Row 3: Subtitle ───────────────────────────────────────────────────────
  const row3 = ws.addRow([`SHOOTING DAY ${day.dayNumber} — CALL SHEET`, '', '', '', '', '']);
  mergeRow(row3, rowNum++);
  row3.height = 18;
  row3.getCell(1).fill = bg(BRAND_CREAM);
  row3.getCell(1).font = f(10, BRAND_MID, true);
  row3.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  // ── Row 4: Date ───────────────────────────────────────────────────────────
  const dateStr = format(new Date(day.calendarDate), 'EEEE, dd MMMM yyyy');
  const row4 = ws.addRow([dateStr, '', '', '', '', '']);
  mergeRow(row4, rowNum++);
  row4.height = 18;
  row4.getCell(1).fill = bg(BRAND_CREAM);
  row4.getCell(1).font = f(10, BRAND_DARK);
  row4.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  // ── Row 5: Location ───────────────────────────────────────────────────────
  const row5 = ws.addRow([cs.location ? `📍 ${cs.location}` : '', '', '', '', '', '']);
  mergeRow(row5, rowNum++);
  row5.height = 18;
  row5.getCell(1).fill = bg(BRAND_CREAM);
  row5.getCell(1).font = f(10, BRAND_DARK);
  row5.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  // ── Row 6: General notes ──────────────────────────────────────────────────
  const row6 = ws.addRow([cs.notes ?? '', '', '', '', '', '']);
  mergeRow(row6, rowNum++);
  row6.height = 40;
  row6.getCell(1).fill = bg(BRAND_OFFWHITE);
  row6.getCell(1).font = f(9, BRAND_DARK);
  row6.getCell(1).alignment = { wrapText: true, vertical: 'top', indent: 1 };

  // ── Field sections ────────────────────────────────────────────────────────

  const fieldsByGroup: Record<string, typeof cs.fields> = { CREW: [], CLIENT: [], LOGISTICS: [] };
  for (const field of cs.fields.filter((fld) => fld.isVisible)) {
    const g = field.fieldGroup as 'CREW' | 'CLIENT' | 'LOGISTICS';
    if (fieldsByGroup[g]) fieldsByGroup[g].push(field);
  }

  const writeSectionHeader = (label: string) => {
    // Write label into A only — no merge
    const r = ws.addRow([label, '', '', '', '', '']);
    r.height = 18;
    for (let i = 1; i <= 6; i++) {
      r.getCell(i).fill = bg(BRAND_CREAM);
      r.getCell(i).font = f(9, BRAND_MID, true);
    }
    rowNum++;
  };

  const writeDataRow = (a: string, b: string, d: string, e: string) => {
    // A=label, B=value, C=empty, D=label, E=value, F=empty — NO MERGES
    const r = ws.addRow([a, b, '', d, e, '']);
    r.height = 18;
    r.getCell(1).fill = bg(BRAND_CREAM); r.getCell(1).font = f(9, BRAND_DARK);
    r.getCell(2).fill = bg(BRAND_OFFWHITE); r.getCell(2).font = f(9, BRAND_DARK);
    r.getCell(3).fill = bg(BRAND_CREAM); r.getCell(3).font = f(9, BRAND_DARK);
    r.getCell(4).fill = bg(BRAND_CREAM); r.getCell(4).font = f(9, BRAND_DARK);
    r.getCell(5).fill = bg(BRAND_OFFWHITE); r.getCell(5).font = f(9, BRAND_DARK);
    r.getCell(6).fill = bg(BRAND_CREAM); r.getCell(6).font = f(9, BRAND_DARK);
    rowNum++;
  };

  // CREW
  writeSectionHeader('CREW');
  const crew = fieldsByGroup['CREW'];
  for (let i = 0; i < crew.length; i += 2) {
    writeDataRow(crew[i].label, crew[i].value ?? '', crew[i + 1]?.label ?? '', crew[i + 1]?.value ?? '');
  }

  // CLIENT
  writeSectionHeader('CLIENT');
  const client = fieldsByGroup['CLIENT'];
  for (let i = 0; i < client.length; i += 2) {
    writeDataRow(client[i].label, client[i].value ?? '', client[i + 1]?.label ?? '', client[i + 1]?.value ?? '');
  }

  // DAILY LOGISTICS — use fixed field-name lookup for the 5 standard slots
  writeSectionHeader('DAILY LOGISTICS');
  const logFields = fieldsByGroup['LOGISTICS'];
  const logVal = (label: string) => logFields.find((f) => f.label.toLowerCase().includes(label.toLowerCase()))?.value ?? '';

  // Row: Start of Day | val | Breakfast | val
  writeDataRow('Start of Day', logVal('start'), 'Breakfast', logVal('breakfast'));
  // Row: Lunch | val | Dinner | val
  writeDataRow('Lunch', logVal('lunch'), 'Dinner', logVal('dinner'));
  // Row: End of Day | val | (blank) | (blank) — NO MERGE, value in B
  writeDataRow('End of Day', logVal('end'), '', '');

  // ── Light Times & Weather ─────────────────────────────────────────────────

  const hasTimes = cs.sunrise || cs.sunset || cs.goldenHourAm || cs.goldenHourPm || cs.blueHourAm || cs.blueHourPm;
  const rawWeather = cs.weatherData as Record<string, unknown> | null | undefined;
  console.log('[export] raw weatherData:', JSON.stringify(cs.weatherData));
  const hasWeather = !!rawWeather && Object.values(rawWeather).some((v) => v != null);

  if (hasTimes || hasWeather) {
    writeSectionHeader('LIGHT TIMES & WEATHER');

    if (hasTimes) {
      // Row: Sunrise | val | Sunset | val | Golden Hour AM | val — NO MERGES
      const tr1 = ws.addRow([
        'Sunrise', cs.sunrise ?? '—',
        'Sunset', cs.sunset ?? '—',
        'Golden Hour AM', cs.goldenHourAm ?? '—',
      ]);
      tr1.height = 18;
      for (let i = 1; i <= 6; i++) {
        const isLabel = i % 2 === 1;
        tr1.getCell(i).fill = bg(isLabel ? BRAND_CREAM : BRAND_OFFWHITE);
        tr1.getCell(i).font = f(9, isLabel ? BRAND_MID : BRAND_DARK, isLabel);
      }
      rowNum++;

      // Row: Golden Hour PM | val | Blue Hour AM | val | Blue Hour PM | val — NO MERGES
      const tr2 = ws.addRow([
        'Golden Hour PM', cs.goldenHourPm ?? '—',
        'Blue Hour AM', cs.blueHourAm ?? '—',
        'Blue Hour PM', cs.blueHourPm ?? '—',
      ]);
      tr2.height = 18;
      for (let i = 1; i <= 6; i++) {
        const isLabel = i % 2 === 1;
        tr2.getCell(i).fill = bg(isLabel ? BRAND_CREAM : BRAND_OFFWHITE);
        tr2.getCell(i).font = f(9, isLabel ? BRAND_MID : BRAND_DARK, isLabel);
      }
      rowNum++;
    }

    if (hasWeather) {
      const w = rawWeather!;
      // Log all keys so we can see the exact structure in Render logs
      const safe = (v: unknown): string => {
        if (v == null) return '—';
        const s = String(v).trim();
        return s === '' || s === 'null' || s === 'undefined' ? '—' : s;
      };

      const descVal  = safe(w.description ?? w.conditions);
      const tempMax  = w.tempMax  as number | null | undefined;
      const tempMin  = w.tempMin  as number | null | undefined;
      const precip   = w.precipitation as number | null | undefined;
      const wind     = w.windSpeed as number | null | undefined;
      const tempStr  = [tempMin != null ? `${tempMin}°` : null, tempMax != null ? `${tempMax}°C` : null].filter(Boolean).join(' – ') || '—';

      // Row: Conditions | val | Temperature | val | Precipitation | val — NO MERGES
      const wr1 = ws.addRow([
        'Conditions', descVal,
        'Temperature', tempStr,
        'Precipitation', precip != null ? `${precip} mm` : '—',
      ]);
      wr1.height = 18;
      for (let i = 1; i <= 6; i++) {
        const isLabel = i % 2 === 1;
        wr1.getCell(i).fill = bg(isLabel ? BRAND_CREAM : BRAND_OFFWHITE);
        wr1.getCell(i).font = f(9, isLabel ? BRAND_MID : BRAND_DARK, isLabel);
      }
      rowNum++;

      // Row: Wind Speed | val | empty × 4 — NO MERGE, value written to B
      const wr2 = ws.addRow(['Wind Speed', wind != null ? `${wind} km/h` : '—', '', '', '', '']);
      wr2.height = 18;
      wr2.getCell(1).fill = bg(BRAND_CREAM);   wr2.getCell(1).font = f(9, BRAND_MID, true);
      wr2.getCell(2).fill = bg(BRAND_OFFWHITE); wr2.getCell(2).font = f(9, BRAND_DARK);
      wr2.getCell(3).fill = bg(BRAND_CREAM);    wr2.getCell(3).font = f(9, BRAND_DARK);
      wr2.getCell(4).fill = bg(BRAND_CREAM);    wr2.getCell(4).font = f(9, BRAND_DARK);
      wr2.getCell(5).fill = bg(BRAND_CREAM);    wr2.getCell(5).font = f(9, BRAND_DARK);
      wr2.getCell(6).fill = bg(BRAND_CREAM);    wr2.getCell(6).font = f(9, BRAND_DARK);
      rowNum++;
    }
  }

  // ── Spacer ────────────────────────────────────────────────────────────────
  const spacer = ws.addRow(['', '', '', '', '', '']);
  mergeRow(spacer, rowNum++);
  spacer.height = 8;
  spacer.getCell(1).fill = bg(BRAND_TAN);

  // ── Shot list header ──────────────────────────────────────────────────────
  // Values set cell-by-cell to avoid any residual merge influence.
  const shotHdr = ws.addRow(['', '', '', '', '', '']);
  shotHdr.height = 22;
  const shotHdrLabels = ['#', 'Shot / Description', 'Location', 'Timing', 'Notes', 'Status'];
  shotHdrLabels.forEach((label, i) => {
    const cell = shotHdr.getCell(i + 1);
    cell.value = label;
    cell.fill  = bg(BRAND_DARK);
    cell.font  = f(9, BRAND_WHITE, true);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  rowNum++;

  // ── Shot rows — flat list, no merges ─────────────────────────────────────
  const cleanStr = (v: string | null | undefined): string => {
    if (!v) return '';
    const n = v.trim().toLowerCase();
    return n === 'none' || n === 'null' || n === 'n/a' ? '' : v.trim();
  };

  const sortedShots = [...cs.shots].sort((a, b) => a.sortOrder - b.sortOrder);
  let shotNum = 0;

  for (const s of sortedShots) {
    const desc = s.shot.description;
    if (!desc) continue;
    const descNorm = desc.trim().toLowerCase();
    if (descNorm === '' || descNorm === 'none' || descNorm === 'null' || descNorm === 'n/a') continue;

    const rowBg = shotNum % 2 === 0 ? BRAND_OFFWHITE : BRAND_CREAM;
    const status = s.statusOverride ?? s.shot.status;
    const statusChar = status === 'DONE' ? '☑' : '☐';

    const sr = ws.addRow([
      shotNum + 1,
      desc,
      cleanStr(s.shot.location?.name),
      cleanStr(s.shot.timing),
      cleanStr(s.shot.notes),
      statusChar,
    ]);
    sr.height = 20;
    for (let i = 1; i <= 6; i++) {
      sr.getCell(i).fill      = bg(rowBg);
      sr.getCell(i).font      = f(9, BRAND_DARK);
      sr.getCell(i).alignment = { wrapText: true, vertical: 'top' };
    }
    sr.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
    sr.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    shotNum++;
    rowNum++;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer = ws.addRow([`${project.agencyName ?? project.name} | CONFIDENTIAL`, '', '', '', '', '']);
  mergeRow(footer, rowNum++);
  footer.height = 18;
  footer.getCell(1).fill      = bg(BRAND_CREAM);
  footer.getCell(1).font      = f(8, BRAND_MID, false, true);
  footer.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // ── Logo overlay ──────────────────────────────────────────────────────────
  // Embedded after all rows so row numbers are stable. Placed over row 1 (top-left).
  if (project.logoUrl) {
    try {
      const m = project.logoUrl.match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/);
      if (m) {
        const ext     = m[1] === 'webp' ? 'png' : m[1] as 'png' | 'jpeg' | 'gif';
        const base64  = m[2];
        let logoW     = 105; // default: 35px height × 3:1 ratio
        const logoH   = 35;
        if (m[1] === 'png') {
          try {
            const hdr = Buffer.from(base64.slice(0, 32), 'base64');
            if (hdr[0] === 0x89 && hdr[1] === 0x50) {
              const iw = hdr.readUInt32BE(16);
              const ih = hdr.readUInt32BE(20);
              if (iw > 0 && ih > 0) logoW = Math.round(logoH * (iw / ih));
            }
          } catch { /* use default */ }
        }
        const imageId = wb.addImage({ base64, extension: ext });
        ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: logoW, height: logoH } });
      }
    } catch { /* skip silently */ }
  }
}

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

// Type definitions for the export service
export interface ShootingDayData {
  id: string;
  dayNumber: number;
  calendarDate: string | Date;
  label?: string | null;
  photographyTypeId?: string | null;
  photographyType?: { id: string; name: string; hexColour: string } | null;
}

export interface CallSheetData {
  id: string;
  shootingDayId: string;
  notes?: string | null;
  isLocked: boolean;
  location?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  sunrise?: string | null;
  sunset?: string | null;
  goldenHourAm?: string | null;
  goldenHourPm?: string | null;
  blueHourAm?: string | null;
  blueHourPm?: string | null;
  weatherData?: { description?: string | null; tempMax?: number | null; tempMin?: number | null; precipitation?: number | null; windSpeed?: number | null } | null;
  fields: Array<{ id: string; label: string; value?: string | null; isVisible: boolean; sortOrder: number; fieldGroup: string }>;
  shots: Array<{
    id: string;
    sortOrder: number;
    statusOverride?: string | null;
    shot: {
      id: string;
      description: string;
      timing?: string | null;
      notes?: string | null;
      status: string;
      tickColourOverride?: string | null;
      location?: { name: string; category?: { photographyType?: { hexColour: string } | null } | null } | null;
      dayAssignments?: Array<{ shootingDayId: string; tickColour?: string | null }>;
    };
  }>;
}

export interface ScheduleProject {
  id: string;
  name: string;
  clientName?: string | null;
  location?: string | null;
  status: string;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  agencyName?: string | null;
  footerText?: string | null;
  logoUrl?: string | null;
  totalShots?: number;
  photographyTypes: Array<{ id: string; name: string; hexColour: string }>;
  shootingDays: ShootingDayData[];
  sections: Array<{
    id: string;
    name: string;
    sortOrder: number;
    categories: Array<{
      id: string;
      name: string;
      sortOrder: number;
      photographyTypeId?: string | null;
      locations: Array<{
        id: string;
        name: string;
        sortOrder: number;
        shots: Array<{
          id: string;
          description: string;
          timing?: string | null;
          tickColourOverride?: string | null;
          dayAssignments?: Array<{ shootingDayId: string; tickColour?: string | null }>;
        }>;
      }>;
    }>;
  }>;
  callSheets: CallSheetData[];
}
