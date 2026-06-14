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
const BRAND_DARK  = '2C2318';
const BRAND_MID   = '7A5C3A';
const BRAND_TAN   = 'B89A7A';
const BRAND_CREAM = 'F5F0EB';
const BRAND_WHITE = 'FAFAF8';

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
  const wsName = `Day ${day.dayNumber}`;
  const ws = wb.addWorksheet(wsName);

  // 6 columns: #  | Shot/Description | Location | Timing | Notes | Status
  ws.columns = [
    { width: 5 },   // #
    { width: 34 },  // Shot / Description
    { width: 20 },  // Location
    { width: 12 },  // Timing
    { width: 28 },  // Notes
    { width: 9 },   // Status
  ];

  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    showGridLines: false,
  };

  const type = project.photographyTypes.find((t) => t.id === day.photographyTypeId);
  const typeColour = type?.hexColour ?? BRAND_DARK;
  const dateStr = format(new Date(day.calendarDate), 'EEEE, dd MMMM yyyy');
  let rowIdx = 1;

  const thinBorder = (color = BRAND_TAN): Partial<ExcelJS.Borders> => ({
    bottom: { style: 'thin', color: { argb: `FF${color}` } },
  });

  const mergeRow = (n: number) => ws.mergeCells(`A${n}:F${n}`);

  // ── Logo (top-right) ──────────────────────────────────────────────────────
  if (project.logoUrl) {
    try {
      const m = project.logoUrl.match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/);
      if (m) {
        const ext = m[1] === 'webp' ? 'png' : m[1] as 'png' | 'jpeg' | 'gif';
        const imageId = wb.addImage({ base64: m[2], extension: ext });
        ws.addImage(imageId, { tl: { col: 4.5, row: 0 }, ext: { width: 110, height: 44 } });
      }
    } catch { /* skip */ }
  }

  // ── Header block ──────────────────────────────────────────────────────────

  // Row 1: Project name
  const r1 = ws.addRow([project.name.toUpperCase(), null, null, null, null, null]);
  mergeRow(rowIdx);
  r1.height = 28;
  r1.getCell(1).fill = fill(BRAND_CREAM);
  r1.getCell(1).font = font({ bold: true, size: 13, color: { argb: `FF${BRAND_DARK}` } });
  r1.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  rowIdx++;

  // Row 2: Title bar
  const r2 = ws.addRow([`SHOOTING DAY ${day.dayNumber} — CALL SHEET`, null, null, null, null, null]);
  mergeRow(rowIdx);
  r2.height = 26;
  r2.getCell(1).fill = fill(BRAND_DARK);
  r2.getCell(1).font = wfont({ bold: true, size: 12 });
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  rowIdx++;

  // Row 3: Date + type colour bar
  const dateLabel = `${dateStr}${type ? `  |  ${type.name}` : ''}`;
  const r3 = ws.addRow([dateLabel, null, null, null, null, null]);
  mergeRow(rowIdx);
  r3.height = 22;
  r3.getCell(1).fill = fill(typeColour);
  r3.getCell(1).font = wfont({ bold: true });
  r3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  rowIdx++;

  // Row 4: Location + date info
  const locationText = cs.location ? `📍 ${cs.location}` : '';
  const r4 = ws.addRow([locationText, null, null, null, null, null]);
  mergeRow(rowIdx);
  r4.height = 20;
  r4.getCell(1).fill = fill(BRAND_CREAM);
  r4.getCell(1).font = font({ color: { argb: `FF${BRAND_MID}` } });
  r4.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  rowIdx++;

  // Row 5: Notes
  if (cs.notes) {
    const r5 = ws.addRow([cs.notes, null, null, null, null, null]);
    mergeRow(rowIdx);
    r5.height = 30;
    r5.getCell(1).fill = fill(BRAND_CREAM);
    r5.getCell(1).font = font({ italic: true, color: { argb: `FF${BRAND_DARK}` } });
    r5.getCell(1).alignment = { wrapText: true, vertical: 'top', indent: 1 };
    rowIdx++;
  }

  // ── Field blocks ──────────────────────────────────────────────────────────

  const fieldsByGroup = { CREW: [] as typeof cs.fields, CLIENT: [] as typeof cs.fields, LOGISTICS: [] as typeof cs.fields };
  for (const f of cs.fields.filter((f) => f.isVisible)) {
    fieldsByGroup[f.fieldGroup as 'CREW' | 'CLIENT' | 'LOGISTICS'].push(f);
  }

  const renderFieldBlock = (label: string, fields: typeof cs.fields, headerBg: string) => {
    if (fields.length === 0) return;
    const hRow = ws.addRow([label, null, null, null, null, null]);
    mergeRow(rowIdx);
    hRow.height = 18;
    hRow.getCell(1).fill = fill(headerBg);
    hRow.getCell(1).font = wfont({ bold: true });
    hRow.getCell(1).alignment = { horizontal: 'center' };
    rowIdx++;

    for (let i = 0; i < fields.length; i += 2) {
      const f1 = fields[i];
      const f2 = fields[i + 1];
      // Spread pairs across 3+3 columns: label | value | label | value (merge pairs)
      const row = ws.addRow([f1.label, f1.value ?? '', null, f2?.label ?? '', f2?.value ?? '', null]);
      ws.mergeCells(`B${rowIdx}:C${rowIdx}`);
      ws.mergeCells(`E${rowIdx}:F${rowIdx}`);
      row.height = 20;
      row.getCell(1).fill = fill(BRAND_CREAM);
      row.getCell(1).font = font({ bold: true, color: { argb: `FF${BRAND_DARK}` } });
      row.getCell(2).fill = fill(BRAND_WHITE);
      row.getCell(2).font = font();
      row.getCell(4).fill = fill(BRAND_CREAM);
      row.getCell(4).font = font({ bold: true, color: { argb: `FF${BRAND_DARK}` } });
      row.getCell(5).fill = fill(BRAND_WHITE);
      row.getCell(5).font = font();
      for (let c = 1; c <= 6; c++) {
        row.getCell(c).border = thinBorder(BORDER_GREY);
      }
      rowIdx++;
    }
  };

  renderFieldBlock('CREW', fieldsByGroup.CREW, BRAND_DARK);
  renderFieldBlock('CLIENT', fieldsByGroup.CLIENT, BRAND_MID);
  renderFieldBlock('DAILY LOGISTICS', fieldsByGroup.LOGISTICS, typeColour);

  // ── Light Times & Weather ─────────────────────────────────────────────────

  const hasSunTimes = cs.sunrise || cs.sunset || cs.goldenHourAm || cs.goldenHourPm || cs.blueHourAm || cs.blueHourPm;
  const hasWeather  = cs.weatherData && (cs.weatherData.description || cs.weatherData.tempMax != null);

  if (hasSunTimes || hasWeather) {
    // Section header
    const ltHdr = ws.addRow(['LIGHT TIMES & WEATHER', null, null, null, null, null]);
    mergeRow(rowIdx);
    ltHdr.height = 18;
    ltHdr.getCell(1).fill = fill(BRAND_MID);
    ltHdr.getCell(1).font = wfont({ bold: true });
    ltHdr.getCell(1).alignment = { horizontal: 'center' };
    ltHdr.getCell(1).border = { bottom: { style: 'medium', color: { argb: `FF${BRAND_TAN}` } } };
    rowIdx++;

    if (hasSunTimes) {
      // Two rows: sunrise/sunset/golden AM  and  golden PM/blue AM/blue PM
      const times1 = ws.addRow([
        'Sunrise', cs.sunrise ?? '—', 'Sunset', cs.sunset ?? '—', 'Golden Hour AM', cs.goldenHourAm ?? '—',
      ]);
      times1.height = 20;
      (['Sunrise', 'Sunset', 'Golden Hour AM'] as const).forEach((_, ci) => {
        const labelCol = ci * 2 + 1;
        const valCol = ci * 2 + 2;
        times1.getCell(labelCol).fill = fill(BRAND_CREAM);
        times1.getCell(labelCol).font = font({ bold: true, color: { argb: `FF${BRAND_MID}` } });
        times1.getCell(valCol).fill = fill(BRAND_WHITE);
        times1.getCell(valCol).font = font();
        times1.getCell(valCol).alignment = { horizontal: 'center' };
      });
      rowIdx++;

      const times2 = ws.addRow([
        'Golden Hour PM', cs.goldenHourPm ?? '—', 'Blue Hour AM', cs.blueHourAm ?? '—', 'Blue Hour PM', cs.blueHourPm ?? '—',
      ]);
      times2.height = 20;
      (['Golden Hour PM', 'Blue Hour AM', 'Blue Hour PM'] as const).forEach((_, ci) => {
        const labelCol = ci * 2 + 1;
        const valCol = ci * 2 + 2;
        times2.getCell(labelCol).fill = fill(BRAND_CREAM);
        times2.getCell(labelCol).font = font({ bold: true, color: { argb: `FF${BRAND_MID}` } });
        times2.getCell(valCol).fill = fill(BRAND_WHITE);
        times2.getCell(valCol).font = font();
        times2.getCell(valCol).alignment = { horizontal: 'center' };
      });
      rowIdx++;
    }

    if (hasWeather) {
      const w = cs.weatherData!;
      const tempStr = [
        w.tempMin != null ? `${w.tempMin}°` : null,
        w.tempMax != null ? `${w.tempMax}°C` : null,
      ].filter(Boolean).join(' – ') || '—';

      const wRow = ws.addRow([
        'Conditions', w.description ?? '—',
        'Temp', tempStr,
        w.precipitation != null ? 'Precipitation' : 'Wind',
        w.precipitation != null ? `${w.precipitation} mm` : w.windSpeed != null ? `${w.windSpeed} km/h` : '—',
      ]);
      wRow.height = 20;
      for (let ci = 0; ci < 3; ci++) {
        const lc = ci * 2 + 1; const vc = ci * 2 + 2;
        wRow.getCell(lc).fill = fill(BRAND_CREAM);
        wRow.getCell(lc).font = font({ bold: true, color: { argb: `FF${BRAND_MID}` } });
        wRow.getCell(vc).fill = fill(BRAND_WHITE);
        wRow.getCell(vc).font = font();
        wRow.getCell(vc).alignment = { horizontal: 'center' };
      }
      rowIdx++;
    }
  }

  // ── Spacer ────────────────────────────────────────────────────────────────

  const spacer = ws.addRow([null, null, null, null, null, null]);
  mergeRow(rowIdx);
  spacer.height = 6;
  spacer.getCell(1).fill = fill(BRAND_TAN);
  rowIdx++;

  // ── Shot list header ──────────────────────────────────────────────────────

  const shotHdr = ws.addRow(['#', 'Shot / Description', 'Location', 'Timing', 'Notes', 'Status']);
  shotHdr.height = 20;
  for (let c = 1; c <= 6; c++) {
    shotHdr.getCell(c).fill = fill(BRAND_DARK);
    shotHdr.getCell(c).font = wfont({ bold: true, size: 10 });
    shotHdr.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
  }
  rowIdx++;

  // ── Shots grouped by location ─────────────────────────────────────────────

  const shotsByLoc = new Map<string, { locName: string; shots: typeof cs.shots }>();
  for (const s of cs.shots.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const locName = s.shot.location?.name ?? 'Unknown';
    if (!shotsByLoc.has(locName)) shotsByLoc.set(locName, { locName, shots: [] });
    shotsByLoc.get(locName)!.shots.push(s);
  }

  let globalShotNum = 1;

  for (const { locName, shots } of shotsByLoc.values()) {
    // Location group header — #7A5C3A bold uppercase, #B89A7A bottom border
    const locRow = ws.addRow([locName.toUpperCase(), null, null, null, null, null]);
    mergeRow(rowIdx);
    locRow.height = 20;
    locRow.getCell(1).fill = fill(BRAND_CREAM);
    locRow.getCell(1).font = font({ bold: true, color: { argb: `FF${BRAND_MID}` } });
    locRow.getCell(1).alignment = { indent: 1 };
    locRow.getCell(1).border = { bottom: { style: 'medium', color: { argb: `FF${BRAND_TAN}` } } };
    rowIdx++;

    let si = 0;
    for (const cs_shot of shots) {
      const bg = si % 2 === 0 ? BRAND_WHITE : BRAND_CREAM;
      const status = cs_shot.statusOverride ?? cs_shot.shot.status;
      const statusChar = status === 'DONE' ? '✓' : '☐';

      const shotRow = ws.addRow([
        globalShotNum,
        cs_shot.shot.description,
        cs_shot.shot.location?.name ?? '',
        cs_shot.shot.timing ?? '',
        cs_shot.shot.notes ?? '',
        statusChar,
      ]);
      shotRow.height = 20;
      for (let c = 1; c <= 6; c++) {
        shotRow.getCell(c).fill = fill(bg);
        shotRow.getCell(c).font = font({ size: 10 });
        shotRow.getCell(c).border = thinBorder();
        shotRow.getCell(c).alignment = { wrapText: true, vertical: 'top' };
      }
      shotRow.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
      shotRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
      si++;
      globalShotNum++;
      rowIdx++;
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────

  const footerText = `${project.agencyName ?? project.name}  |  CONFIDENTIAL`;
  const footer = ws.addRow([footerText, null, null, null, null, null]);
  mergeRow(rowIdx);
  footer.height = 20;
  footer.getCell(1).fill = fill(BRAND_CREAM);
  footer.getCell(1).font = font({ italic: true, color: { argb: `FF${BRAND_MID}` } });
  footer.getCell(1).alignment = { horizontal: 'center' };
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
