import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Pin, GripVertical, Plus, Upload, ChevronsDownUp, ChevronsUpDown, Search, Check, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { projectsApi } from '../../api/projects';
import { useUiStore } from '../../stores/uiStore';
import { ShotSection, ShotCategory, ShotLocation, Shot, ShootingDay, PhotographyType } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import toast from 'react-hot-toast';

interface ScheduleGridProps {
  projectId: string;
  days: ShootingDay[];
  types: PhotographyType[];
}



interface TickCellProps {
  shotId: string;
  day: ShootingDay;
  assignments: Array<{ id: string; shootingDayId: string; tickColour?: string | null }>;
  tickColourOverride?: string | null;
  onToggle: (shotId: string, day: ShootingDay, assignmentId?: string) => void;
  sectionColour: string;
}

function TickCell({ shotId, day, assignments, tickColourOverride, onToggle, sectionColour }: TickCellProps) {
  const assignment = assignments.find((a) => a.shootingDayId === day.id);
  const colour = tickColourOverride ?? assignment?.tickColour ?? sectionColour;

  return (
    <td
      className="border border-gray-200 cursor-pointer select-none transition-colors"
      style={{
        minWidth: 44,
        height: 44,
        backgroundColor: assignment ? colour : '#F0F0F0',
      }}
      onClick={() => onToggle(shotId, day, assignment?.id)}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') onToggle(shotId, day, assignment?.id); }}
      tabIndex={0}
      role="checkbox"
      aria-checked={!!assignment}
      aria-label={`${day.label ?? `Day ${day.dayNumber}`} assignment`}
    >
      {assignment && (
        <div className="flex items-center justify-center w-full h-full">
          <Check className="w-4 h-4 text-white" strokeWidth={3} />
        </div>
      )}
    </td>
  );
}

function InlineEdit({ value, onSave, className }: { value: string; onSave: (v: string) => Promise<void>; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = async () => {
    setEditing(false);
    if (draft !== value) await onSave(draft);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        className={clsx('w-full bg-transparent border-b border-blue-400 focus:outline-none text-sm px-1', className)}
      />
    );
  }

  return (
    <span
      className={clsx('cursor-text hover:bg-black/5 px-1 rounded text-sm', className)}
      onClick={() => setEditing(true)}
    >
      {value || <span className="text-gray-400 italic">Empty</span>}
    </span>
  );
}

function SortableShot({
  shot,
  days,
  assignments,
  sectionColour,
  onToggle,
  onUpdate,
  onDelete,
  isEven,
}: {
  shot: Shot;
  days: ShootingDay[];
  assignments: Array<{ id: string; shootingDayId: string; tickColour?: string | null }>;
  sectionColour: string;
  onToggle: (shotId: string, day: ShootingDay, assignmentId?: string) => void;
  onUpdate: (shotId: string, data: Partial<Shot>) => Promise<void>;
  onDelete: (shotId: string) => Promise<void>;
  isEven: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: shot.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <tr ref={setNodeRef} style={style} className={clsx('group hover:bg-blue-50/30 transition-colors', isEven ? 'bg-white' : 'bg-gray-50/50')}>
      <td className="px-2 py-1 border-b border-gray-100 sticky left-0 z-10" style={{ backgroundColor: 'inherit', minWidth: 280, maxWidth: 340 }}>
        <div className="flex items-center gap-1.5">
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0 p-0.5">
            <GripVertical className="w-3 h-3" />
          </button>
          <InlineEdit
            value={shot.description}
            onSave={(v) => onUpdate(shot.id, { description: v })}
            className="flex-1 min-w-0"
          />
          <button
            onClick={() => onDelete(shot.id)}
            className="flex-shrink-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
            title="Delete shot"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </td>
      <td className="px-2 py-1 border-b border-gray-100 sticky left-[280px] z-10 bg-inherit" style={{ minWidth: 90 }}>
        <InlineEdit
          value={shot.timing ?? ''}
          onSave={(v) => onUpdate(shot.id, { timing: v })}
          className="text-xs text-gray-500"
        />
      </td>
      <td className="px-2 py-1 border-b border-gray-100 bg-inherit" style={{ minWidth: 150 }}>
        <InlineEdit
          value={shot.notes ?? ''}
          onSave={(v) => onUpdate(shot.id, { notes: v })}
          className="text-xs text-gray-500"
        />
      </td>
      {days.map((day) => (
        <TickCell
          key={day.id}
          shotId={shot.id}
          day={day}
          assignments={assignments}
          tickColourOverride={shot.tickColourOverride}
          onToggle={onToggle}
          sectionColour={sectionColour}
        />
      ))}
    </tr>
  );
}

export default function ScheduleGrid({ projectId, days, types }: ScheduleGridProps) {
  const queryClient = useQueryClient();
  const setSaveStatus = useUiStore((s) => s.setSaveStatus);
  const { collapsedSections, collapsedCategories, collapsedLocations, toggleSectionCollapse, toggleCategoryCollapse, toggleLocationCollapse, collapseAll, expandAll } = useUiStore();
  const [search, setSearch] = useState('');
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ['shots', projectId],
    queryFn: () => projectsApi.getShots(projectId),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Collect all IDs for collapse all
  const allSectionIds = sections.map((s) => s.id);
  const allCategoryIds = sections.flatMap((s) => s.categories.map((c) => c.id));
  const allLocationIds = sections.flatMap((s) => s.categories.flatMap((c) => c.locations.map((l) => l.id)));

  const toggleAssignment = useMutation({
    mutationFn: async ({ shotId, day, assignmentId }: { shotId: string; day: ShootingDay; assignmentId?: string }) => {
      if (assignmentId) {
        await projectsApi.deleteAssignment(projectId, assignmentId);
      } else {
        await projectsApi.createAssignment(projectId, { shotId, shootingDayId: day.id });
      }
    },
    onMutate: async ({ shotId, day, assignmentId }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['shots', projectId] });
      const prev = queryClient.getQueryData<ShotSection[]>(['shots', projectId]);
      queryClient.setQueryData<ShotSection[]>(['shots', projectId], (old) =>
        old?.map((s) => ({
          ...s,
          categories: s.categories.map((cat) => ({
            ...cat,
            locations: cat.locations.map((loc) => ({
              ...loc,
              shots: loc.shots.map((shot) => {
                if (shot.id !== shotId) return shot;
                const assignments = shot.dayAssignments ?? [];
                if (assignmentId) {
                  return { ...shot, dayAssignments: assignments.filter((a) => a.id !== assignmentId) };
                } else {
                  return { ...shot, dayAssignments: [...assignments, { id: 'temp', shotId, shootingDayId: day.id }] };
                }
              }),
            })),
          })),
        }))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['shots', projectId], ctx.prev);
      toast.error('Failed to update assignment');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['shots', projectId] }),
  });

  const updateShot = async (shotId: string, data: Partial<Shot>) => {
    setSaveStatus('saving');
    try {
      await projectsApi.updateShot(projectId, shotId, data);
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  const deleteShot = async (shotId: string) => {
    if (!confirm('Delete this shot?')) return;
    try {
      await projectsApi.deleteShot(projectId, shotId);
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
    } catch {
      toast.error('Failed to delete shot');
    }
  };

  const updateLocation = async (locId: string, name: string) => {
    if (!name.trim()) return;
    setSaveStatus('saving');
    try {
      await projectsApi.updateLocation(projectId, locId, { name: name.trim() });
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Find the shots in same location and reorder
    for (const section of sections) {
      for (const cat of section.categories) {
        for (const loc of cat.locations) {
          const activeIdx = loc.shots.findIndex((s) => s.id === active.id);
          const overIdx = loc.shots.findIndex((s) => s.id === over.id);
          if (activeIdx >= 0 && overIdx >= 0) {
            const newOrder = overIdx;
            await projectsApi.reorderShot(projectId, active.id as string, newOrder);
            queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
            return;
          }
        }
      }
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await projectsApi.importShots(projectId, file);
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
      toast.success('Shot list imported');
    } catch {
      toast.error('Import failed');
    }
    e.target.value = '';
  };

  const addSection = async () => {
    if (!newSectionName.trim()) return;
    await projectsApi.createSection(projectId, {
      name: newSectionName.trim(),
      sortOrder: sections.length,
    });
    queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
    setNewSectionName('');
    setAddSectionOpen(false);
  };

  const filteredSections = search
    ? sections.map((s) => ({
        ...s,
        categories: s.categories.map((c) => ({
          ...c,
          locations: c.locations.map((l) => ({
            ...l,
            shots: l.shots.filter((sh) =>
              sh.description.toLowerCase().includes(search.toLowerCase()) ||
              sh.timing?.toLowerCase().includes(search.toLowerCase())
            ),
          })).filter((l) => l.shots.length > 0),
        })).filter((c) => c.locations.length > 0),
      })).filter((s) => s.categories.length > 0)
    : sections;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1A1A2E]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-wrap">
        <div className="flex items-center gap-1 border border-gray-300 rounded-md px-2 py-1.5 flex-1 max-w-64">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search shots…"
            className="flex-1 text-sm focus:outline-none bg-transparent"
          />
        </div>

        <button
          onClick={() => collapseAll(allSectionIds, allCategoryIds, allLocationIds)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50 text-gray-600"
        >
          <ChevronsUpDown className="w-3.5 h-3.5" /> Collapse All
        </button>
        <button
          onClick={expandAll}
          className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50 text-gray-600"
        >
          <ChevronsDownUp className="w-3.5 h-3.5" /> Expand All
        </button>

        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50 text-gray-600"
        >
          <Upload className="w-3.5 h-3.5" /> Import .xlsx
        </button>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />

        <button
          onClick={() => setAddSectionOpen(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[#1A1A2E] text-white rounded-md hover:bg-[#2C2C54]"
        >
          <Plus className="w-3.5 h-3.5" /> Section
        </button>
      </div>

      <Modal open={addSectionOpen} onClose={() => setAddSectionOpen(false)} title="Add Section" size="sm">
        <div className="space-y-4">
          <Input
            label="Section name"
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addSection(); }}
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAddSectionOpen(false)}>Cancel</Button>
            <Button onClick={addSection} disabled={!newSectionName.trim()}>Add Section</Button>
          </div>
        </div>
      </Modal>

      {/* Grid */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="border-collapse" style={{ minWidth: 520 + days.length * 44 }}>
            <colgroup>
              <col style={{ minWidth: 280, width: 280 }} />
              <col style={{ minWidth: 90, width: 90 }} />
              <col style={{ minWidth: 150, width: 150 }} />
              {days.map((d) => <col key={d.id} style={{ minWidth: 44, width: 44 }} />)}
            </colgroup>

            {/* Header */}
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="bg-[#2A3A5C] text-white text-xs font-bold text-left px-3 border-r border-white/20 sticky left-0 z-30 py-2">
                  SHOT / LOCATION
                </th>
                <th className="bg-[#2A3A5C] text-white text-xs font-bold px-2 sticky left-[280px] z-30 border-r border-white/20 py-2">
                  TIMING
                </th>
                <th className="bg-[#2A3A5C] text-white text-xs font-bold px-2 border-r border-white/20 py-2">
                  NOTES
                </th>
                {days.map((d) => (
                  <th
                    key={d.id}
                    className="text-white text-xs font-bold text-center px-1 border-r border-white/10 py-2"
                    style={{ backgroundColor: d.headerColour ?? '#2A3A5C' }}
                  >
                    <div className="leading-tight">
                      <div>Day {d.dayNumber}</div>
                      <div className="font-normal opacity-80 text-[10px]">
                        {new Date(d.calendarDate).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
                      </div>
                      {d.label && (
                        <div className="font-semibold text-[11px] mt-0.5 whitespace-normal">{d.label}</div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredSections.length === 0 ? (
                <tr>
                  <td colSpan={3 + days.length} className="py-16 text-center text-gray-400 text-sm">
                    No shots yet. Add a section to get started.
                  </td>
                </tr>
              ) : (
                filteredSections.map((section) => {
                  const sectionCollapsed = collapsedSections.has(section.id);
                  const sectionColour = section.photographyType?.hexColour ?? '#2C2C54';

                  return (
                    <>
                      {/* Section row */}
                      <tr key={`sec-${section.id}`}>
                        <td
                          colSpan={3 + days.length}
                          className="px-3 py-2 cursor-pointer select-none"
                          style={{ backgroundColor: sectionColour }}
                          onClick={() => toggleSectionCollapse(section.id)}
                        >
                          <div className="flex items-center gap-2">
                            {sectionCollapsed ? (
                              <ChevronRight className="w-4 h-4 text-white/70 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-white/70 flex-shrink-0" />
                            )}
                            <span className="text-white font-bold text-sm uppercase tracking-wide">
                              {section.name}
                            </span>
                            <SectionActions section={section} projectId={projectId} />
                          </div>
                        </td>
                      </tr>

                      {!sectionCollapsed && section.categories.map((cat) => {
                        const catCollapsed = collapsedCategories.has(cat.id);
                        const catColour = cat.photographyType?.hexColour ?? sectionColour;

                        return (
                          <>
                            {/* Category row */}
                            <tr key={`cat-${cat.id}`}>
                              <td
                                colSpan={3 + days.length}
                                className="px-4 py-1.5 cursor-pointer select-none"
                                style={{ backgroundColor: catColour, filter: cat.photographyTypeId ? undefined : 'brightness(1.15)' }}
                                onClick={() => toggleCategoryCollapse(cat.id)}
                              >
                                <div className="flex items-center gap-2">
                                  {catCollapsed ? (
                                    <ChevronRight className="w-3.5 h-3.5 text-white/70" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-white/70" />
                                  )}
                                  <span className="text-white font-semibold text-sm">{cat.name}</span>
                                  <CategoryActions cat={cat} section={section} projectId={projectId} types={types} />
                                </div>
                              </td>
                            </tr>

                            {!catCollapsed && cat.locations.map((loc) => {
                              const locCollapsed = collapsedLocations.has(loc.id);
                              const tickColour = catColour;
                              return (
                                <>
                                  {/* Location row */}
                                  <tr key={`loc-${loc.id}`} className="bg-[#F0F0F0]">
                                    <td className="px-4 py-1.5 border-b border-gray-200 sticky left-0 z-10 bg-[#F0F0F0]" style={{ minWidth: 280 }}>
                                      <div className="flex items-center gap-2">
                                        <button onClick={() => toggleLocationCollapse(loc.id)} className="text-gray-500 hover:text-gray-700">
                                          {locCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                        </button>
                                        <Pin className="w-3 h-3 text-gray-400" />
                                        <InlineEdit
                                          value={loc.name}
                                          onSave={(v) => updateLocation(loc.id, v)}
                                          className="font-semibold text-gray-800"
                                        />
                                        <LocationActions loc={loc} cat={cat} projectId={projectId} />
                                      </div>
                                    </td>
                                    <td className="sticky left-[280px] z-10 bg-[#F0F0F0] border-b border-gray-200" />
                                    <td className="bg-[#F0F0F0] border-b border-gray-200" style={{ minWidth: 150, height: 32 }} />
                                    {days.map((d) => <td key={d.id} className="bg-[#F0F0F0] border-b border-gray-200 border-l border-gray-200" style={{ minWidth: 44, height: 32 }} />)}
                                  </tr>

                                  {!locCollapsed && (
                                    <SortableContext items={loc.shots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                                      {loc.shots.map((shot, si) => (
                                        <SortableShot
                                          key={shot.id}
                                          shot={shot}
                                          days={days}
                                          assignments={shot.dayAssignments ?? []}
                                          sectionColour={tickColour}
                                          onToggle={(shotId, day, assignmentId) =>
                                            toggleAssignment.mutate({ shotId, day, assignmentId })
                                          }
                                          onUpdate={updateShot}
                                          onDelete={deleteShot}
                                          isEven={si % 2 === 0}
                                        />
                                      ))}
                                    </SortableContext>
                                  )}

                                  {/* Add shot button */}
                                  {!locCollapsed && (
                                    <tr>
                                      <td colSpan={3 + days.length} className="px-8 py-1 border-b border-gray-100">
                                        <AddShotButton locationId={loc.id} projectId={projectId} sortOrder={loc.shots.length} />
                                      </td>
                                    </tr>
                                  )}
                                </>
                              );
                            })}
                          </>
                        );
                      })}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </DndContext>
      </div>
    </div>
  );
}

function AddShotButton({ locationId, projectId, sortOrder }: { locationId: string; projectId: string; sortOrder: number }) {
  const queryClient = useQueryClient();
  const addMutation = useMutation({
    mutationFn: () => projectsApi.createShot(projectId, { description: 'New shot', locationId, sortOrder }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shots', projectId] }),
    onError: () => toast.error('Failed to add shot'),
  });
  return (
    <button onClick={() => addMutation.mutate()} className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#1A1A2E] transition-colors py-0.5">
      <Plus className="w-3 h-3" /> Add shot
    </button>
  );
}

function SectionActions({ section, projectId }: { section: ShotSection; projectId: string }) {
  const queryClient = useQueryClient();
  return (
    <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={async () => {
          const name = prompt('Add category:', '');
          if (!name) return;
          await projectsApi.createCategory(projectId, { name, sectionId: section.id });
          queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
        }}
        className="px-2 py-0.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10"
        title="Add category"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={async () => {
          if (!confirm(`Delete section "${section.name}" and all its contents?`)) return;
          await projectsApi.deleteSection(projectId, section.id);
          queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
        }}
        className="px-2 py-0.5 rounded text-xs text-white/50 hover:text-red-300 hover:bg-white/10"
        title="Delete section"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function CategoryActions({ cat, section: _section, projectId, types }: { cat: ShotCategory; section: ShotSection; projectId: string; types: PhotographyType[] }) {
  const queryClient = useQueryClient();
  return (
    <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
      <select
        value={cat.photographyTypeId ?? ''}
        onChange={async (e) => {
          await projectsApi.updateCategory(projectId, cat.id, { photographyTypeId: e.target.value || null });
          queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
        }}
        className="text-xs bg-white/10 text-white border border-white/20 rounded px-1 py-0.5 cursor-pointer focus:outline-none"
        title="Photography type"
      >
        <option value="" style={{ backgroundColor: '#1A1A2E' }}>Inherit</option>
        {types.map((t) => (
          <option key={t.id} value={t.id} style={{ backgroundColor: t.hexColour }}>{t.name}</option>
        ))}
      </select>
      <button
        onClick={async () => {
          const name = prompt('Add location:', '');
          if (!name) return;
          await projectsApi.createLocation(projectId, { name, categoryId: cat.id });
          queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
        }}
        className="px-2 py-0.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10"
        title="Add location"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={async () => {
          if (!confirm(`Delete category "${cat.name}" and all its contents?`)) return;
          await projectsApi.deleteCategory(projectId, cat.id);
          queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
        }}
        className="px-2 py-0.5 rounded text-xs text-white/50 hover:text-red-300 hover:bg-white/10"
        title="Delete category"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function LocationActions({ loc, cat: _cat, projectId }: { loc: ShotLocation; cat: ShotCategory; projectId: string }) {
  const queryClient = useQueryClient();
  return (
    <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={async () => {
          if (!confirm(`Delete location "${loc.name}"?`)) return;
          await projectsApi.deleteLocation(projectId, loc.id);
          queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
        }}
        className="px-1 py-0.5 rounded text-xs text-gray-400 hover:text-red-600 hover:bg-red-50"
        title="Delete location"
      >
        ×
      </button>
    </div>
  );
}
