import ExcelJS from 'exceljs';
import { format } from 'date-fns';

const NAVY = '1A1A2E';
const GOLD = 'D4AF37';
const INDIGO = '2C2C54';
const DAY_HDR = '2A3A5C';
const LIGHT_GREY = 'F0F0F0';
const OFF_WHITE = 'FAFAFA';
const BORDER_GREY = 'D0D0D0';
const BODY_TEXT = '1A1A1A';

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

  ws.columns = [{ width: 28 }, { width: 28 }, { width: 28 }, { width: 28 }];

  const type = project.photographyTypes.find((t) => t.id === day.photographyTypeId);
  const typeColour = type?.hexColour ?? NAVY;
  const dateStr = format(new Date(day.calendarDate), 'EEEE, dd MMMM yyyy');
  let rowIdx = 1;

  const addRow = (vals: (string | null)[], bg: string, textColor: string, bold = false, merge = false) => {
    const row = ws.addRow(vals);
    row.height = 20;
    for (let i = 1; i <= 4; i++) {
      row.getCell(i).fill = fill(bg);
      row.getCell(i).font = font({ color: { argb: `FF${hex(textColor)}` }, bold });
    }
    if (merge) ws.mergeCells(`A${rowIdx}:D${rowIdx}`);
    rowIdx++;
    return row;
  };

  // Logo (top-right corner of call sheet)
  if (project.logoUrl) {
    try {
      const dataUrlMatch = project.logoUrl.match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/);
      if (dataUrlMatch) {
        const ext = dataUrlMatch[1] === 'webp' ? 'png' : dataUrlMatch[1] as 'png' | 'jpeg' | 'gif';
        const base64 = dataUrlMatch[2];
        const imageId = wb.addImage({ base64, extension: ext });
        ws.addImage(imageId, { tl: { col: 3, row: 0 }, ext: { width: 100, height: 40 } });
      }
    } catch {
      // skip logo if embedding fails
    }
  }

  // Row 1: Title
  const r1 = ws.addRow([`SHOOTING DAY ${day.dayNumber} — CALL SHEET`, null, null, null]);
  ws.mergeCells(`A1:D1`);
  r1.height = 28;
  r1.getCell(1).fill = fill(NAVY);
  r1.getCell(1).font = wfont({ bold: true, size: 13, color: { argb: `FF${GOLD}` } });
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  rowIdx++;

  // Row 2: Date + type colour bar
  const r2 = ws.addRow([`${dateStr} | ${type?.name ?? ''}`, null, null, null]);
  ws.mergeCells(`A2:D2`);
  r2.height = 22;
  r2.getCell(1).fill = fill(typeColour);
  r2.getCell(1).font = wfont({ bold: true });
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  rowIdx++;

  // Row 3: Notes
  const r3 = ws.addRow([cs.notes ?? '', null, null, null]);
  ws.mergeCells(`A3:D3`);
  r3.height = 30;
  r3.getCell(1).fill = fill(OFF_WHITE);
  r3.getCell(1).font = font({ italic: true });
  r3.getCell(1).alignment = { wrapText: true };
  rowIdx++;

  // Row 4: spacer
  const r4 = ws.addRow(['', null, null, null]);
  r4.height = 8;
  ws.mergeCells(`A4:D4`);
  r4.getCell(1).fill = fill(LIGHT_GREY);
  rowIdx++;

  const fieldsByGroup = { CREW: [] as typeof cs.fields, CLIENT: [] as typeof cs.fields, LOGISTICS: [] as typeof cs.fields };
  for (const f of cs.fields.filter((f) => f.isVisible)) {
    fieldsByGroup[f.fieldGroup as 'CREW' | 'CLIENT' | 'LOGISTICS'].push(f);
  }

  const renderFieldBlock = (label: string, fields: typeof cs.fields, headerBg: string) => {
    // Header
    const hRow = ws.addRow([label, null, null, null]);
    ws.mergeCells(`A${rowIdx}:D${rowIdx}`);
    hRow.height = 18;
    hRow.getCell(1).fill = fill(headerBg);
    hRow.getCell(1).font = wfont({ bold: true });
    hRow.getCell(1).alignment = { horizontal: 'center' };
    rowIdx++;

    // Fields in two-column pairs
    for (let i = 0; i < fields.length; i += 2) {
      const f1 = fields[i];
      const f2 = fields[i + 1];
      const row = ws.addRow([f1.label, f1.value ?? '', f2?.label ?? '', f2?.value ?? '']);
      row.height = 18;
      row.getCell(1).fill = fill(LIGHT_GREY);
      row.getCell(1).font = font({ bold: true });
      row.getCell(2).fill = fill('FFFFFF');
      row.getCell(2).font = font();
      row.getCell(3).fill = fill(LIGHT_GREY);
      row.getCell(3).font = font({ bold: true });
      row.getCell(4).fill = fill('FFFFFF');
      row.getCell(4).font = font();
      for (let c = 1; c <= 4; c++) {
        row.getCell(c).border = { ...border(), top: { style: 'thin', color: { argb: `FF${BORDER_GREY}` } } };
      }
      rowIdx++;
    }
  };

  renderFieldBlock('CREW', fieldsByGroup.CREW, NAVY);
  renderFieldBlock('CLIENT', fieldsByGroup.CLIENT, INDIGO);
  renderFieldBlock('DAILY LOGISTICS', fieldsByGroup.LOGISTICS, typeColour);

  // Spacer
  const spacer = ws.addRow(['', null, null, null]);
  ws.mergeCells(`A${rowIdx}:D${rowIdx}`);
  spacer.getCell(1).fill = fill(LIGHT_GREY);
  spacer.height = 8;
  rowIdx++;

  // Shot list headers
  const shotHdr = ws.addRow(['SHOT / LOCATION', 'TIMING', 'NOTES / DIRECTION', 'STATUS']);
  shotHdr.height = 20;
  for (let c = 1; c <= 4; c++) {
    shotHdr.getCell(c).fill = fill(NAVY);
    shotHdr.getCell(c).font = wfont({ bold: true });
    shotHdr.getCell(c).alignment = { horizontal: 'center' };
  }
  rowIdx++;

  // Group shots by location
  const shotsByLoc = new Map<string, { locName: string; shots: typeof cs.shots }>();
  for (const s of cs.shots.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const locName = s.shot.location?.name ?? 'Unknown';
    if (!shotsByLoc.has(locName)) shotsByLoc.set(locName, { locName, shots: [] });
    shotsByLoc.get(locName)!.shots.push(s);
  }

  for (const { locName, shots } of shotsByLoc.values()) {
    const locRow = ws.addRow([locName, null, null, null]);
    ws.mergeCells(`A${rowIdx}:D${rowIdx}`);
    locRow.height = 18;
    locRow.getCell(1).fill = fill(LIGHT_GREY);
    locRow.getCell(1).font = font({ bold: true });
    rowIdx++;

    let si = 0;
    for (const cs_shot of shots) {
      const bg = si % 2 === 0 ? 'FFFFFF' : OFF_WHITE;
      const shotRow = ws.addRow([
        cs_shot.shot.description,
        cs_shot.shot.timing ?? '',
        cs_shot.shot.notes ?? '',
        cs_shot.statusOverride ?? cs_shot.shot.status,
      ]);
      shotRow.height = 18;
      for (let c = 1; c <= 4; c++) {
        shotRow.getCell(c).fill = fill(bg);
        shotRow.getCell(c).font = font();
        shotRow.getCell(c).border = border();
        shotRow.getCell(c).alignment = { wrapText: true };
      }
      si++;
      rowIdx++;
    }
  }

  // Footer
  const footer = ws.addRow([`${project.agencyName ?? project.name} | CONFIDENTIAL`, null, null, null]);
  ws.mergeCells(`A${rowIdx}:D${rowIdx}`);
  footer.height = 20;
  footer.getCell(1).fill = fill(LIGHT_GREY);
  footer.getCell(1).font = font({ italic: true });
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
