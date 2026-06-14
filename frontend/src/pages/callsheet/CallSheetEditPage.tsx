import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Save, Download, Plus, Trash2, Sun, Clock, List,
  Upload, FileSpreadsheet, FileText, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { productionCsApi } from '../../api/productionCallsheets';
import { ProductionCallSheet, ProductionShot, ShotStatus } from '../../types';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import api from '../../api/client';
import toast from 'react-hot-toast';

// ─── helpers ────────────────────────────────────────────────────────────────

function toTime(isoUtc: string): string {
  const d = new Date(isoUtc);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function addMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const nm = ((total % 1440) + 1440) % 1440 % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

async function fetchLightTimes(location: string, date: string): Promise<Partial<ProductionCallSheet>> {
  // Step 1: geocode
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
  );
  if (!geoRes.ok) throw new Error('Geocoding failed');
  const geoData = await geoRes.json() as { results?: { latitude: number; longitude: number }[] };
  const place = geoData.results?.[0];
  if (!place) throw new Error(`Could not find location: ${location}`);

  const { latitude, longitude } = place;

  // Step 2: sunrise/sunset
  const solarRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=sunrise,sunset&timezone=auto&start_date=${date}&end_date=${date}`
  );
  if (!solarRes.ok) throw new Error('Solar data fetch failed');
  const solarData = await solarRes.json() as { daily?: { sunrise?: string[]; sunset?: string[] } };
  const sunriseIso = solarData.daily?.sunrise?.[0];
  const sunsetIso = solarData.daily?.sunset?.[0];
  if (!sunriseIso || !sunsetIso) throw new Error('No solar data returned');

  const sunriseTime = toTime(sunriseIso);
  const sunsetTime = toTime(sunsetIso);

  return {
    sunrise: sunriseTime,
    sunset: sunsetTime,
    goldenHourAm: sunriseTime,
    goldenHourPm: addMinutes(sunsetTime, -60),
    blueHourAm: addMinutes(sunriseTime, -40),
    blueHourPm: sunsetTime,
  };
}

// ─── section wrapper ────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
          {icon} {title}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-700 pt-4">{children}</div>}
    </div>
  );
}

// ─── field grid ────────────────────────────────────────────────────────────

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;
}

// ─── time input ─────────────────────────────────────────────────────────────

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] min-h-[44px]"
      />
    </div>
  );
}

// ─── status badge ───────────────────────────────────────────────────────────

const STATUS_COLOURS: Record<ShotStatus, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700',
};

// ─── main page ──────────────────────────────────────────────────────────────

export default function CallSheetEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [fetchingLight, setFetchingLight] = useState(false);

  const { data: sheet, isLoading } = useQuery({
    queryKey: ['production-callsheet', id],
    queryFn: () => productionCsApi.get(id!),
  });

  const [form, setForm] = useState<Partial<ProductionCallSheet>>({});
  const [formLoaded, setFormLoaded] = useState(false);

  // Merge server data into local form once (on load)
  if (sheet && !formLoaded) {
    setForm(sheet);
    setFormLoaded(true);
  }

  const set = useCallback((key: keyof ProductionCallSheet, value: string | null) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const saveForm = async () => {
    setSaving(true);
    try {
      await productionCsApi.update(id!, form);
      qc.invalidateQueries({ queryKey: ['production-callsheet', id] });
      qc.invalidateQueries({ queryKey: ['production-callsheets'] });
      toast.success('Saved');
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Shot mutations
  const addShotMutation = useMutation({
    mutationFn: () => productionCsApi.addShot(id!, { description: 'New shot', sortOrder: (sheet?.shots.length ?? 0) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['production-callsheet', id] }),
    onError: () => toast.error('Failed to add shot'),
  });

  const updateShotMutation = useMutation({
    mutationFn: ({ shotId, data }: { shotId: string; data: Partial<ProductionShot> }) =>
      productionCsApi.updateShot(id!, shotId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['production-callsheet', id] }),
  });

  const deleteShotMutation = useMutation({
    mutationFn: (shotId: string) => productionCsApi.deleteShot(id!, shotId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['production-callsheet', id] }),
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => productionCsApi.importShots(id!, file),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['production-callsheet', id] });
      toast.success(`Imported ${data.imported} shots`);
    },
    onError: () => toast.error('Import failed'),
  });

  const handleFetchLight = async () => {
    const loc = form.location;
    const date = form.shootingDate ? format(new Date(form.shootingDate), 'yyyy-MM-dd') : null;
    if (!loc || !date) {
      toast.error('Enter a location and shooting date first');
      return;
    }
    setFetchingLight(true);
    try {
      const times = await fetchLightTimes(loc, date);
      setForm((f) => ({ ...f, ...times }));
      toast.success('Light times auto-populated');
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Could not fetch light times. Enter manually.');
    } finally {
      setFetchingLight(false);
    }
  };

  const downloadFile = async (url: string, filename: string) => {
    // Save form first so export has latest data
    await saveForm();
    try {
      const response = await api.get(url, { responseType: 'arraybuffer' });
      const ct = String(response.headers['content-type'] ?? '');
      const isPdf = ct.includes('pdf');
      const isXlsx = ct.includes('spreadsheetml');
      if (!isPdf && !isXlsx) {
        const text = new TextDecoder().decode(response.data as ArrayBuffer);
        let msg = 'Export failed';
        try { msg = JSON.parse(text)?.error ?? msg; } catch { /* */ }
        toast.error(msg);
        return;
      }
      const blob = new Blob([response.data as ArrayBuffer], { type: ct });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      toast.success('Download started');
    } catch {
      toast.error('Export failed');
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-64 bg-gray-200 rounded" />
      </div>
    );
  }

  if (!sheet) return <div className="text-gray-500">Call sheet not found.</div>;

  const safeName = (form.projectName ?? sheet.projectName).replace(/[^a-z0-9]/gi, '_');

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/call-sheet')}
            className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {form.projectName || sheet.projectName}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {form.shootingDate ? format(new Date(form.shootingDate), 'EEEE, dd MMMM yyyy') : 'No date set'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadFile(productionCsApi.exportPdfUrl(id!), `${safeName}_callsheet.pdf`)}
          >
            <FileText className="w-4 h-4" /> PDF
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadFile(productionCsApi.exportExcelUrl(id!), `${safeName}_callsheet.xlsx`)}
          >
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
          <Button size="sm" onClick={saveForm} loading={saving}>
            <Save className="w-4 h-4" /> Save
          </Button>
        </div>
      </div>

      {/* 2a Production Details */}
      <Section title="Production Details" icon={<FileText className="w-4 h-4" />}>
        <FieldGrid>
          <Input
            label="Project Name"
            value={form.projectName ?? ''}
            onChange={(e) => set('projectName', e.target.value)}
            required
          />
          <Input
            label="Client"
            value={form.client ?? ''}
            onChange={(e) => set('client', e.target.value || null)}
          />
          <Input
            label="Location"
            value={form.location ?? ''}
            onChange={(e) => set('location', e.target.value || null)}
            placeholder="e.g. Cape Town, South Africa"
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Shooting Date</label>
            <input
              type="date"
              value={form.shootingDate ? format(new Date(form.shootingDate), 'yyyy-MM-dd') : ''}
              onChange={(e) => set('shootingDate', e.target.value ? new Date(e.target.value).toISOString() : null)}
              className="w-full px-3 py-2 text-sm border rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] min-h-[44px]"
            />
          </div>
        </FieldGrid>
        <div className="mt-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">General Notes</label>
          <textarea
            value={form.generalNotes ?? ''}
            onChange={(e) => set('generalNotes', e.target.value || null)}
            rows={3}
            placeholder="Any general notes for the day…"
            className="mt-1 w-full px-3 py-2 text-sm border rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] resize-y"
          />
        </div>
      </Section>

      {/* 2b Light & Weather */}
      <Section title="Light & Weather Times" icon={<Sun className="w-4 h-4" />}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-gray-500">Enter manually or auto-populate from location and date.</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleFetchLight}
            loading={fetchingLight}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Auto-populate
          </Button>
        </div>
        <FieldGrid>
          <TimeInput label="Sunrise" value={form.sunrise ?? ''} onChange={(v) => set('sunrise', v || null)} />
          <TimeInput label="Sunset" value={form.sunset ?? ''} onChange={(v) => set('sunset', v || null)} />
          <TimeInput label="Golden Hour AM" value={form.goldenHourAm ?? ''} onChange={(v) => set('goldenHourAm', v || null)} />
          <TimeInput label="Golden Hour PM" value={form.goldenHourPm ?? ''} onChange={(v) => set('goldenHourPm', v || null)} />
          <TimeInput label="Blue Hour AM" value={form.blueHourAm ?? ''} onChange={(v) => set('blueHourAm', v || null)} />
          <TimeInput label="Blue Hour PM" value={form.blueHourPm ?? ''} onChange={(v) => set('blueHourPm', v || null)} />
        </FieldGrid>
      </Section>

      {/* 2c Daily Logistics */}
      <Section title="Daily Logistics" icon={<Clock className="w-4 h-4" />}>
        <FieldGrid>
          <TimeInput label="Start of Day" value={form.startOfDay ?? ''} onChange={(v) => set('startOfDay', v || null)} />
          <TimeInput label="Breakfast Time" value={form.breakfastTime ?? ''} onChange={(v) => set('breakfastTime', v || null)} />
          <TimeInput label="Lunch Time" value={form.lunchTime ?? ''} onChange={(v) => set('lunchTime', v || null)} />
          <TimeInput label="Dinner Time" value={form.dinnerTime ?? ''} onChange={(v) => set('dinnerTime', v || null)} />
          <TimeInput label="End of Day" value={form.endOfDay ?? ''} onChange={(v) => set('endOfDay', v || null)} />
        </FieldGrid>
      </Section>

      {/* 2d Shot List */}
      <Section title={`Shot List (${sheet.shots.length})`} icon={<List className="w-4 h-4" />}>
        <div className="flex items-center gap-2 mb-4">
          <Button size="sm" onClick={() => addShotMutation.mutate()} loading={addShotMutation.isPending}>
            <Plus className="w-3.5 h-3.5" /> Add Shot
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importMutation.mutate(file);
              e.target.value = '';
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            loading={importMutation.isPending}
          >
            <Upload className="w-3.5 h-3.5" /> Import xlsx
          </Button>
          <p className="text-xs text-gray-400 ml-1">
            Columns: Shooting Location, Description, Timing, Notes
          </p>
        </div>

        {sheet.shots.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm border-2 border-dashed rounded-lg">
            No shots yet. Add manually or import from an xlsx file.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead className="bg-[#1A1A2E] text-white text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Shooting Location</th>
                  <th className="px-3 py-2 text-left font-medium">Shot Description</th>
                  <th className="px-3 py-2 text-left font-medium w-24">Timing</th>
                  <th className="px-3 py-2 text-left font-medium">Notes</th>
                  <th className="px-3 py-2 text-left font-medium w-28">Status</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {sheet.shots.map((shot, i) => (
                  <ShotRow
                    key={shot.id}
                    shot={shot}
                    bg={i % 2 === 0 ? '' : 'bg-gray-50 dark:bg-gray-800/50'}
                    onUpdate={(data) => updateShotMutation.mutate({ shotId: shot.id, data })}
                    onDelete={() => deleteShotMutation.mutate(shot.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Bottom export bar */}
      <div className="flex items-center justify-between py-4 border-t border-gray-200 dark:border-gray-700 mt-2">
        <p className="text-xs text-gray-400">Remember to save before exporting.</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => downloadFile(productionCsApi.exportPdfUrl(id!), `${safeName}_callsheet.pdf`)}>
            <Download className="w-4 h-4" /> Export PDF
          </Button>
          <Button variant="secondary" size="sm" onClick={() => downloadFile(productionCsApi.exportExcelUrl(id!), `${safeName}_callsheet.xlsx`)}>
            <Download className="w-4 h-4" /> Export Excel
          </Button>
          <Button size="sm" onClick={saveForm} loading={saving}>
            <Save className="w-4 h-4" /> Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── inline-editable shot row ───────────────────────────────────────────────

function ShotRow({
  shot,
  bg,
  onUpdate,
  onDelete,
}: {
  shot: ProductionShot;
  bg: string;
  onUpdate: (data: Partial<ProductionShot>) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState<Partial<ProductionShot>>({});
  const merged = { ...shot, ...local };

  const commit = (key: keyof ProductionShot, value: string | null) => {
    if (value === (shot as unknown as Record<string, unknown>)[key]) return;
    onUpdate({ [key]: value });
  };

  const cellClass = `px-2 py-1.5 text-xs bg-transparent border border-transparent hover:border-gray-300 focus:border-[#1A1A2E] focus:outline-none rounded w-full`;

  return (
    <tr className={bg}>
      <td className="px-1 py-1">
        <input
          className={cellClass}
          value={merged.shootingLocation ?? ''}
          onChange={(e) => setLocal((l) => ({ ...l, shootingLocation: e.target.value }))}
          onBlur={(e) => commit('shootingLocation', e.target.value || null)}
          placeholder="Location"
        />
      </td>
      <td className="px-1 py-1">
        <input
          className={cellClass}
          value={merged.description ?? ''}
          onChange={(e) => setLocal((l) => ({ ...l, description: e.target.value }))}
          onBlur={(e) => { if (e.target.value) commit('description', e.target.value); }}
          placeholder="Shot description"
        />
      </td>
      <td className="px-1 py-1">
        <input
          className={cellClass}
          value={merged.timing ?? ''}
          onChange={(e) => setLocal((l) => ({ ...l, timing: e.target.value }))}
          onBlur={(e) => commit('timing', e.target.value || null)}
          placeholder="e.g. 30min"
        />
      </td>
      <td className="px-1 py-1">
        <input
          className={cellClass}
          value={merged.notes ?? ''}
          onChange={(e) => setLocal((l) => ({ ...l, notes: e.target.value }))}
          onBlur={(e) => commit('notes', e.target.value || null)}
          placeholder="Notes"
        />
      </td>
      <td className="px-1 py-1">
        <select
          value={merged.status}
          onChange={(e) => { const v = e.target.value as ShotStatus; setLocal((l) => ({ ...l, status: v })); onUpdate({ status: v }); }}
          className={`${cellClass} ${STATUS_COLOURS[merged.status as ShotStatus] ?? ''}`}
        >
          <option value="PENDING">Pending</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="DONE">Done</option>
        </select>
      </td>
      <td className="px-1 py-1 text-right">
        <button
          onClick={onDelete}
          className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}
