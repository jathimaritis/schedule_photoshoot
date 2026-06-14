import { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Eye, EyeOff, Plus, X, GripVertical, Check, Download,
  Sun, RefreshCw, Wind, CloudRain, Thermometer, AlertTriangle,
} from 'lucide-react';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { format } from 'date-fns';
import { projectsApi, exportApi } from '../../api/projects';
import { productionCsApi } from '../../api/productionCallsheets';
import { useUiStore } from '../../stores/uiStore';
import { CallSheetField, FieldGroup, WeatherData } from '../../types';
import PlacesAutocompleteInput from './PlacesAutocompleteInput';
import toast from 'react-hot-toast';
import api from '../../api/client';

interface CallSheetEditorProps {
  projectId: string;
  dayId: string;
}

// ─── draggable field row ─────────────────────────────────────────────────────

function SortableField({
  field,
  onUpdate,
  onRemove,
}: {
  field: CallSheetField;
  onUpdate: (id: string, data: Partial<CallSheetField>) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 py-1">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
        <GripVertical className="w-4 h-4" />
      </button>
      <input
        value={field.label}
        onChange={(e) => onUpdate(field.id, { label: e.target.value })}
        className="w-36 text-sm font-medium border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none bg-transparent"
        placeholder="Label"
      />
      <input
        value={field.value ?? ''}
        onChange={(e) => onUpdate(field.id, { value: e.target.value })}
        className="flex-1 text-sm border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none bg-transparent"
        placeholder="Value"
      />
      <button
        onClick={() => onUpdate(field.id, { isVisible: !field.isVisible })}
        className={clsx('p-1 rounded', field.isVisible ? 'text-gray-400 hover:text-gray-700' : 'text-gray-200 hover:text-gray-400')}
        title={field.isVisible ? 'Hide' : 'Show'}
      >
        {field.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>
      <button onClick={() => onRemove(field.id)} className="p-1 text-gray-300 hover:text-red-500 rounded">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function FieldBlock({
  group, fields, colour, onUpdate, onAdd, onRemove, onReorder,
}: {
  group: FieldGroup;
  fields: CallSheetField[];
  colour: string;
  onUpdate: (id: string, data: Partial<CallSheetField>) => void;
  onAdd: (group: FieldGroup) => void;
  onRemove: (id: string) => void;
  onReorder: (group: FieldGroup, ids: string[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = fields.findIndex((f) => f.id === active.id);
    const newIdx = fields.findIndex((f) => f.id === over.id);
    onReorder(group, arrayMove(fields, oldIdx, newIdx).map((f) => f.id));
  };

  return (
    <div className="mb-4">
      <div className="px-4 py-2 font-bold text-white text-sm uppercase tracking-wider" style={{ backgroundColor: colour }}>
        {group}
      </div>
      <div className="border border-t-0 border-gray-200 rounded-b-md px-4 py-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            {fields.map((f) => (
              <SortableField key={f.id} field={f} onUpdate={onUpdate} onRemove={onRemove} />
            ))}
          </SortableContext>
        </DndContext>
        <button onClick={() => onAdd(group)} className="mt-1 flex items-center gap-1 text-xs text-gray-400 hover:text-[#2C2318]">
          <Plus className="w-3.5 h-3.5" /> Add field
        </button>
      </div>
    </div>
  );
}

// ─── time input for sun times ────────────────────────────────────────────────

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs font-medium uppercase tracking-wide" style={{ color: '#7A5C3A' }}>{label}</label>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#7A5C3A] bg-white"
      />
    </div>
  );
}

// ─── local meta type ─────────────────────────────────────────────────────────

type LocalMeta = {
  location: string | null;
  locationLat: number | null;
  locationLng: number | null;
  sunrise: string | null;
  sunset: string | null;
  goldenHourAm: string | null;
  goldenHourPm: string | null;
  blueHourAm: string | null;
  blueHourPm: string | null;
  weatherData: WeatherData | null;
};

// ─── main editor ─────────────────────────────────────────────────────────────

export default function CallSheetEditor({ projectId, dayId }: CallSheetEditorProps) {
  const queryClient = useQueryClient();
  const setSaveStatus = useUiStore((s) => s.setSaveStatus);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const { data: callSheet, isLoading } = useQuery({
    queryKey: ['callsheet', projectId, dayId],
    queryFn: () => projectsApi.getCallSheet(projectId, dayId),
  });

  const [localFields, setLocalFields] = useState<CallSheetField[] | null>(null);
  const [localNotes, setLocalNotes] = useState<string | null>(null);
  const [localMeta, setLocalMeta] = useState<LocalMeta | null>(null);
  const [fetchingLight, setFetchingLight] = useState(false);
  const [lightWarning, setLightWarning] = useState<string | null>(null);

  // Refs always hold the latest values so the debounced timer saves correctly
  const latestFieldsRef = useRef<CallSheetField[]>([]);
  const latestNotesRef = useRef<string>('');
  const latestMetaRef = useRef<LocalMeta>({
    location: null, locationLat: null, locationLng: null,
    sunrise: null, sunset: null, goldenHourAm: null, goldenHourPm: null,
    blueHourAm: null, blueHourPm: null, weatherData: null,
  });

  // Derive current display values (local state overrides server data)
  const fields = localFields ?? callSheet?.fields ?? [];
  const notes = localNotes ?? callSheet?.notes ?? '';
  const meta: LocalMeta = localMeta ?? {
    location: callSheet?.location ?? null,
    locationLat: callSheet?.locationLat ?? null,
    locationLng: callSheet?.locationLng ?? null,
    sunrise: callSheet?.sunrise ?? null,
    sunset: callSheet?.sunset ?? null,
    goldenHourAm: callSheet?.goldenHourAm ?? null,
    goldenHourPm: callSheet?.goldenHourPm ?? null,
    blueHourAm: callSheet?.blueHourAm ?? null,
    blueHourPm: callSheet?.blueHourPm ?? null,
    weatherData: (callSheet?.weatherData as WeatherData) ?? null,
  };

  // Keep refs in sync — runs on every render before any timers fire
  latestFieldsRef.current = fields;
  latestNotesRef.current = notes;
  latestMetaRef.current = meta;

  // Single debounced save — always reads from refs so it gets the latest values
  const triggerSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        await projectsApi.updateCallSheetFields(projectId, dayId, latestFieldsRef.current);
        await projectsApi.updateCallSheet(projectId, dayId, {
          notes: latestNotesRef.current,
          ...latestMetaRef.current,
        });
        queryClient.invalidateQueries({ queryKey: ['callsheet', projectId, dayId] });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('error');
        toast.error('Auto-save failed');
      }
    }, 500);
  }, [projectId, dayId, queryClient, setSaveStatus]);

  // ── field operations ──────────────────────────────────────────────────────

  const updateField = (id: string, data: Partial<CallSheetField>) => {
    setLocalFields(fields.map((f) => (f.id === id ? { ...f, ...data } : f)));
    triggerSave();
  };

  const addField = (group: FieldGroup) => {
    const newField: CallSheetField = {
      id: `new-${Date.now()}`,
      label: 'New field',
      value: '',
      isVisible: true,
      sortOrder: fields.filter((f) => f.fieldGroup === group).length,
      fieldGroup: group,
      callSheetId: callSheet?.id ?? '',
    };
    setLocalFields([...fields, newField]);
    triggerSave();
  };

  const removeField = (id: string) => {
    setLocalFields(fields.filter((f) => f.id !== id));
    triggerSave();
  };

  const reorderGroup = (group: FieldGroup, ids: string[]) => {
    const otherFields = fields.filter((f) => f.fieldGroup !== group);
    const groupFields = ids.map((id, i) => ({ ...fields.find((f) => f.id === id)!, sortOrder: i }));
    setLocalFields([...otherFields, ...groupFields]);
    triggerSave();
  };

  const updateNotes = (value: string) => {
    setLocalNotes(value);
    triggerSave();
  };

  // ── meta / location / sun times ───────────────────────────────────────────

  const updateMeta = (updates: Partial<LocalMeta>) => {
    const newMeta = { ...meta, ...updates };
    setLocalMeta(newMeta);
    triggerSave();
  };

  const fetchLightTimes = async () => {
    const date = callSheet?.shootingDay?.calendarDate
      ? format(new Date(callSheet.shootingDay.calendarDate), 'yyyy-MM-dd')
      : null;
    if (!date) { toast.error('No shooting date available'); return; }
    if (!meta.location && meta.locationLat == null) { toast.error('Enter a location first'); return; }

    setFetchingLight(true);
    setLightWarning(null);
    try {
      const result = await productionCsApi.fetchSunTimes({
        lat: meta.locationLat,
        lng: meta.locationLng,
        location: meta.locationLat == null ? meta.location : null,
        date,
      });
      updateMeta({
        sunrise: result.sunrise,
        sunset: result.sunset,
        goldenHourAm: result.goldenHourAm,
        goldenHourPm: result.goldenHourPm,
        blueHourAm: result.blueHourAm,
        blueHourPm: result.blueHourPm,
        weatherData: result.weather,
      });
      toast.success('Light times and weather populated');
    } catch (e: unknown) {
      const axiosMsg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const msg = axiosMsg || (e as Error).message || 'Could not fetch light times';
      setLightWarning(msg);
      toast.error(msg + ' — enter manually');
    } finally {
      setFetchingLight(false);
    }
  };

  const handleExport = async () => {
    const url = exportApi.callSheetUrl(projectId, dayId);
    const response = await api.get(url, { responseType: 'blob' });
    const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `callsheet_day_${dayId}.xlsx`;
    a.click();
  };

  if (isLoading || !callSheet) {
    return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2C2318]" /></div>;
  }

  const day = callSheet.shootingDay!;
  const type = day.photographyType;
  const typeColour = type?.hexColour ?? '#1A1A2E';

  const FIELD_BLOCK_COLOURS: Record<FieldGroup, string> = {
    CREW: '#2C2318',
    CLIENT: '#7A5C3A',
    LOGISTICS: typeColour,
  };

  const groupedFields = {
    CREW: fields.filter((f) => f.fieldGroup === 'CREW').sort((a, b) => a.sortOrder - b.sortOrder),
    CLIENT: fields.filter((f) => f.fieldGroup === 'CLIENT').sort((a, b) => a.sortOrder - b.sortOrder),
    LOGISTICS: fields.filter((f) => f.fieldGroup === 'LOGISTICS').sort((a, b) => a.sortOrder - b.sortOrder),
  };

  const shotsByLoc = new Map<string, { locName: string; shots: typeof callSheet.shots }>();
  for (const s of callSheet.shots.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const locName = s.shot.location?.name ?? 'Unknown';
    if (!shotsByLoc.has(locName)) shotsByLoc.set(locName, { locName, shots: [] });
    shotsByLoc.get(locName)!.shots.push(s);
  }

  const weather = meta.weatherData;

  return (
    <div className="max-w-4xl mx-auto print-full">
      {/* Export button */}
      <div className="flex justify-end mb-4 no-print">
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-[#2C2318] text-white rounded-md text-sm hover:bg-[#7A5C3A]">
          <Download className="w-4 h-4" /> Export .xlsx
        </button>
      </div>

      {/* Title bar */}
      <div className="px-6 py-4 flex items-center justify-center" style={{ backgroundColor: '#2C2318' }}>
        <h1 className="text-xl font-bold tracking-widest" style={{ color: '#D4AF37' }}>
          SHOOTING DAY {day.dayNumber} — CALL SHEET
        </h1>
      </div>

      {/* Date bar */}
      <div className="px-6 py-3" style={{ backgroundColor: typeColour }}>
        <p className="text-white font-semibold text-center">
          {format(new Date(day.calendarDate), 'EEEE, dd MMMM yyyy')}
          {type && ` | ${type.name}`}
        </p>
      </div>

      {/* Location + Notes */}
      <div className="border-b border-gray-200" style={{ backgroundColor: '#F5F0EB' }}>
        <div className="px-6 pt-3 pb-1">
          <PlacesAutocompleteInput
            value={meta.location ?? ''}
            onChange={(name, lat, lng) =>
              updateMeta({ location: name || null, locationLat: lat, locationLng: lng })
            }
          />
        </div>
        <textarea
          value={notes}
          onChange={(e) => updateNotes(e.target.value)}
          placeholder="Production notes (optional)…"
          className="w-full px-6 py-3 text-sm text-gray-700 bg-transparent focus:outline-none resize-none"
          rows={2}
        />
      </div>

      {/* Field blocks */}
      <div className="bg-white border-b border-gray-200 p-4">
        {(['CREW', 'CLIENT', 'LOGISTICS'] as FieldGroup[]).map((group) => (
          <FieldBlock
            key={group}
            group={group}
            fields={groupedFields[group]}
            colour={FIELD_BLOCK_COLOURS[group]}
            onUpdate={updateField}
            onAdd={addField}
            onRemove={removeField}
            onReorder={reorderGroup}
          />
        ))}
      </div>

      {/* Light Times & Weather */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div
            className="flex items-center gap-2 px-4 py-2 font-bold text-white text-sm uppercase tracking-wider"
            style={{ backgroundColor: '#7A5C3A', borderBottom: '2px solid #B89A7A' }}
          >
            <Sun className="w-4 h-4" /> Light Times &amp; Weather
          </div>
          <button
            onClick={fetchLightTimes}
            disabled={fetchingLight}
            className="flex items-center gap-1.5 text-xs text-[#7A5C3A] hover:underline disabled:opacity-50 font-medium no-print"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetchingLight ? 'animate-spin' : ''}`} />
            Auto-populate from location &amp; date
          </button>
        </div>

        {lightWarning && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{lightWarning} — enter times manually below.</span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <TimeInput label="Sunrise"       value={meta.sunrise ?? ''}      onChange={(v) => updateMeta({ sunrise: v || null })} />
          <TimeInput label="Sunset"        value={meta.sunset ?? ''}       onChange={(v) => updateMeta({ sunset: v || null })} />
          <TimeInput label="Golden Hour AM" value={meta.goldenHourAm ?? ''} onChange={(v) => updateMeta({ goldenHourAm: v || null })} />
          <TimeInput label="Golden Hour PM" value={meta.goldenHourPm ?? ''} onChange={(v) => updateMeta({ goldenHourPm: v || null })} />
          <TimeInput label="Blue Hour AM"  value={meta.blueHourAm ?? ''}   onChange={(v) => updateMeta({ blueHourAm: v || null })} />
          <TimeInput label="Blue Hour PM"  value={meta.blueHourPm ?? ''}   onChange={(v) => updateMeta({ blueHourPm: v || null })} />
        </div>

        {weather && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-gray-100 rounded p-3" style={{ backgroundColor: '#F5F0EB' }}>
            {weather.description && (
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Conditions</p>
                  <p className="text-sm font-medium text-gray-800">{weather.description}</p>
                </div>
              </div>
            )}
            {(weather.tempMax != null || weather.tempMin != null) && (
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-red-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Temperature</p>
                  <p className="text-sm font-medium text-gray-800">
                    {weather.tempMin != null ? `${weather.tempMin}°` : ''}
                    {weather.tempMin != null && weather.tempMax != null ? ' – ' : ''}
                    {weather.tempMax != null ? `${weather.tempMax}°C` : ''}
                  </p>
                </div>
              </div>
            )}
            {weather.precipitation != null && (
              <div className="flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Precipitation</p>
                  <p className="text-sm font-medium text-gray-800">{weather.precipitation} mm</p>
                </div>
              </div>
            )}
            {weather.windSpeed != null && (
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Wind Speed</p>
                  <p className="text-sm font-medium text-gray-800">{weather.windSpeed} km/h</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Shot list */}
      <div className="bg-white">
        <div className="grid grid-cols-4 gap-0 border-b-2 border-gray-300" style={{ backgroundColor: '#2C2318' }}>
          {['SHOT / LOCATION', 'TIMING', 'NOTES / DIRECTION', 'STATUS'].map((h) => (
            <div key={h} className="px-3 py-2 text-xs font-bold text-white text-center">{h}</div>
          ))}
        </div>

        {callSheet.shots.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            No shots assigned. Generate call sheets from the call sheets list page.
          </div>
        ) : (
          Array.from(shotsByLoc.values()).map(({ locName, shots }) => (
            <div key={locName}>
              <div className="px-3 py-2 font-bold text-sm border-b border-gray-200" style={{ backgroundColor: '#F5F0EB', color: '#2C2318' }}>
                {locName}
              </div>
              {shots.map((cs, i) => (
                <div
                  key={cs.id}
                  className={clsx('grid grid-cols-4 gap-0 border-b border-gray-100 text-sm', i % 2 === 0 ? 'bg-[#FAFAF8]' : 'bg-[#F5F0EB]')}
                >
                  <div className="px-3 py-2">{cs.shot.description}</div>
                  <div className="px-3 py-2 text-gray-500">{cs.shot.timing ?? ''}</div>
                  <div className="px-3 py-2 text-gray-500">{cs.shot.notes ?? ''}</div>
                  <div className="px-3 py-2 flex items-center gap-2">
                    <ShotStatusCheckbox shot={cs} projectId={projectId} dayId={dayId} />
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 text-xs text-center italic" style={{ backgroundColor: '#F5F0EB', color: '#7A5C3A' }}>
        Confidential — {new Date().getFullYear()}
      </div>
    </div>
  );
}

// ─── shot status checkbox ─────────────────────────────────────────────────────

function ShotStatusCheckbox({ shot, projectId, dayId }: { shot: { id: string; statusOverride?: string | null; shot: { status: string } }; projectId: string; dayId: string }) {
  const queryClient = useQueryClient();
  const isDone = (shot.statusOverride ?? shot.shot.status) === 'DONE';

  const toggle = async () => {
    await projectsApi.updateCallSheet(projectId, dayId, {});
    queryClient.invalidateQueries({ queryKey: ['callsheet', projectId, dayId] });
  };

  return (
    <button
      onClick={toggle}
      className={clsx('w-6 h-6 rounded border-2 flex items-center justify-center transition-colors', isDone ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-gray-500')}
      aria-label="Toggle status"
    >
      {isDone && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
    </button>
  );
}
