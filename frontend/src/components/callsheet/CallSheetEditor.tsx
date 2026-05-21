import { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Plus, X, GripVertical, Check, Download } from 'lucide-react';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { format } from 'date-fns';
import { projectsApi, exportApi } from '../../api/projects';
import { useUiStore } from '../../stores/uiStore';
import { CallSheetField, FieldGroup } from '../../types';
import toast from 'react-hot-toast';
import api from '../../api/client';

interface CallSheetEditorProps {
  projectId: string;
  dayId: string;
}

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
  group,
  fields,
  colour,
  onUpdate,
  onAdd,
  onRemove,
  onReorder,
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
    const reordered = arrayMove(fields, oldIdx, newIdx);
    onReorder(group, reordered.map((f) => f.id));
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
        <button onClick={() => onAdd(group)} className="mt-1 flex items-center gap-1 text-xs text-gray-400 hover:text-[#1A1A2E]">
          <Plus className="w-3.5 h-3.5" /> Add field
        </button>
      </div>
    </div>
  );
}

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

  const fields = localFields ?? callSheet?.fields ?? [];
  const notes = localNotes ?? callSheet?.notes ?? '';

  const autoSave = useCallback(
    (newFields: CallSheetField[], newNotes: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveStatus('saving');
      saveTimer.current = setTimeout(async () => {
        try {
          await projectsApi.updateCallSheetFields(projectId, dayId, newFields);
          await projectsApi.updateCallSheet(projectId, dayId, { notes: newNotes });
          queryClient.invalidateQueries({ queryKey: ['callsheet', projectId, dayId] });
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
        } catch {
          setSaveStatus('error');
          toast.error('Auto-save failed');
        }
      }, 500);
    },
    [projectId, dayId, queryClient, setSaveStatus]
  );

  const updateField = (id: string, data: Partial<CallSheetField>) => {
    const newFields = fields.map((f) => (f.id === id ? { ...f, ...data } : f));
    setLocalFields(newFields);
    autoSave(newFields, notes);
  };

  const addField = (group: FieldGroup) => {
    const groupFields = fields.filter((f) => f.fieldGroup === group);
    const newField: CallSheetField = {
      id: `new-${Date.now()}`,
      label: 'New field',
      value: '',
      isVisible: true,
      sortOrder: groupFields.length,
      fieldGroup: group,
      callSheetId: callSheet?.id ?? '',
    };
    const newFields = [...fields, newField];
    setLocalFields(newFields);
    autoSave(newFields, notes);
  };

  const removeField = (id: string) => {
    const newFields = fields.filter((f) => f.id !== id);
    setLocalFields(newFields);
    autoSave(newFields, notes);
  };

  const reorderGroup = (group: FieldGroup, ids: string[]) => {
    const otherFields = fields.filter((f) => f.fieldGroup !== group);
    const groupFields = ids.map((id, i) => {
      const f = fields.find((f) => f.id === id)!;
      return { ...f, sortOrder: i };
    });
    const newFields = [...otherFields, ...groupFields];
    setLocalFields(newFields);
    autoSave(newFields, notes);
  };

  const updateNotes = (value: string) => {
    setLocalNotes(value);
    autoSave(fields, value);
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
    return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1A1A2E]" /></div>;
  }

  const day = callSheet.shootingDay!;
  const type = day.photographyType;
  const typeColour = type?.hexColour ?? '#1A1A2E';

  const FIELD_BLOCK_COLOURS: Record<FieldGroup, string> = {
    CREW: '#1A1A2E',
    CLIENT: '#2C2C54',
    LOGISTICS: typeColour,
  };

  const groupedFields = {
    CREW: fields.filter((f) => f.fieldGroup === 'CREW').sort((a, b) => a.sortOrder - b.sortOrder),
    CLIENT: fields.filter((f) => f.fieldGroup === 'CLIENT').sort((a, b) => a.sortOrder - b.sortOrder),
    LOGISTICS: fields.filter((f) => f.fieldGroup === 'LOGISTICS').sort((a, b) => a.sortOrder - b.sortOrder),
  };

  // Group shots by location
  const shotsByLoc = new Map<string, { locName: string; shots: typeof callSheet.shots }>();
  for (const s of callSheet.shots.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const locName = s.shot.location?.name ?? 'Unknown';
    if (!shotsByLoc.has(locName)) shotsByLoc.set(locName, { locName, shots: [] });
    shotsByLoc.get(locName)!.shots.push(s);
  }

  return (
    <div className="max-w-4xl mx-auto print-full">
      {/* Export button */}
      <div className="flex justify-end mb-4 no-print">
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-[#1A1A2E] text-white rounded-md text-sm hover:bg-[#2C2C54]">
          <Download className="w-4 h-4" /> Export .xlsx
        </button>
      </div>

      {/* Title bar */}
      <div className="px-6 py-4 flex items-center justify-center" style={{ backgroundColor: '#1A1A2E' }}>
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

      {/* Notes */}
      <div className="bg-gray-50 border-b border-gray-200">
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

      {/* Shot list */}
      <div className="bg-white">
        {/* Column headers */}
        <div className="grid grid-cols-4 gap-0 border-b-2 border-gray-300" style={{ backgroundColor: '#1A1A2E' }}>
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
              <div className="px-3 py-2 font-bold text-sm text-gray-800 bg-[#F0F0F0] border-b border-gray-200">
                {locName}
              </div>
              {shots.map((cs, i) => (
                <div
                  key={cs.id}
                  className={clsx('grid grid-cols-4 gap-0 border-b border-gray-100 text-sm', i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')}
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
      <div className="px-4 py-2 bg-[#F0F0F0] text-xs text-gray-500 text-center italic">
        Confidential — {new Date().getFullYear()}
      </div>
    </div>
  );
}

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
