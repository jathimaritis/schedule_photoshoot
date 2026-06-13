import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { projectsApi } from '../../api/projects';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import toast from 'react-hot-toast';
import { format, addDays, parseISO } from 'date-fns';

const DEFAULT_TYPES = [
  { name: 'Accommodation', hexColour: '#6B3060' },
  { name: 'Dining', hexColour: '#B85C2C' },
  { name: 'Lifestyle', hexColour: '#2E6E8A' },
  { name: 'Wellness', hexColour: '#1F7A6E' },
  { name: 'Common Areas', hexColour: '#7A6230' },
  { name: 'Aerial', hexColour: '#2B5FA8' },
];

export default function NewProjectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);

  // Step 1: Basic info
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Step 2: Photography types
  const [types, setTypes] = useState(DEFAULT_TYPES);

  // Step 3: Shooting days
  const [days, setDays] = useState<Array<{ calendarDate: string; label: string; headerColour: string }>>([]);

  const createProject = useMutation({
    mutationFn: async () => {
      const project = await projectsApi.create({
        name, clientName: clientName || undefined, location: location || undefined,
        status: status as 'DRAFT' | 'ACTIVE', startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
      });
      await Promise.all(
        types.map((t, i) => projectsApi.createType(project.id, { ...t, sortOrder: i }))
      );
      const validDays = days.filter((d) => d.calendarDate);
      if (validDays.length > 0) {
        await projectsApi.bulkCreateDays(project.id, validDays.map((d, i) => ({
          dayNumber: i + 1,
          calendarDate: new Date(d.calendarDate).toISOString(),
          label: d.label || undefined,
          headerColour: d.headerColour || undefined,
        })));
      }
      return project;
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project created!');
      navigate(`/projects/${project.id}/schedule`);
    },
    onError: () => toast.error('Failed to create project'),
  });

  const generateDaysFromDates = () => {
    if (!startDate || !endDate) return;
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const newDays = [];
    let current = start;
    while (current <= end) {
      newDays.push({ calendarDate: format(current, 'yyyy-MM-dd'), label: '', headerColour: '' });
      current = addDays(current, 1);
    }
    setDays(newDays);
  };

  const addType = () => setTypes((t) => [...t, { name: '', hexColour: '#2B5FA8' }]);
  const removeType = (i: number) => setTypes((t) => t.filter((_, j) => j !== i));
  const updateType = (i: number, key: 'name' | 'hexColour', v: string) =>
    setTypes((t) => t.map((x, j) => j === i ? { ...x, [key]: v } : x));

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">New Project</h1>
        <div className="flex gap-2 mt-3">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= s ? 'bg-[#1A1A2E] text-white' : 'bg-gray-200 text-gray-500'}`}>
                {s}
              </div>
              {s < 3 && <ChevronRight className="w-4 h-4 text-gray-400" />}
            </div>
          ))}
          <span className="ml-2 text-sm text-gray-500 self-center">
            {step === 1 ? 'Project Details' : step === 2 ? 'Photography Types' : 'Shooting Days'}
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        {step === 1 && (
          <div className="space-y-4">
            <Input label="Project name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer Resort Campaign 2025" required />
            <Input label="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Acme Resorts" />
            <Input label="Location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bali, Indonesia" />
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[{ value: 'DRAFT', label: 'Draft' }, { value: 'ACTIVE', label: 'Active' }]}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Define the photography types for this project. Each type gets a colour used in the schedule grid.</p>
            <div className="space-y-2">
              {types.map((t, i) => (
                <div key={i} className="flex items-center gap-3">
                  <input type="color" value={t.hexColour} onChange={(e) => updateType(i, 'hexColour', e.target.value)} className="w-10 h-10 rounded cursor-pointer border border-gray-300" />
                  <input
                    value={t.name}
                    onChange={(e) => updateType(i, 'name', e.target.value)}
                    placeholder="Type name"
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]"
                  />
                  <button onClick={() => removeType(i)} className="p-2 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addType} className="mt-3 flex items-center gap-2 text-sm text-[#1A1A2E] hover:underline">
              <Plus className="w-4 h-4" /> Add type
            </button>
          </div>
        )}

        {step === 3 && (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Add your shooting days.{' '}
              {startDate && endDate ? (
                <button onClick={generateDaysFromDates} className="text-[#1A1A2E] hover:underline font-medium">Auto-generate from project dates</button>
              ) : (
                <span className="text-amber-600 text-xs">(Set start &amp; end dates in Step 1 to auto-generate)</span>
              )}
            </p>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {days.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-12 flex-shrink-0">Day {i + 1}</span>
                  <input
                    type="date"
                    value={d.calendarDate}
                    onChange={(e) => setDays((ds) => ds.map((x, j) => j === i ? { ...x, calendarDate: e.target.value } : x))}
                    className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]"
                  />
                  <input
                    placeholder="Title (optional)"
                    value={d.label}
                    onChange={(e) => setDays((ds) => ds.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                    className="flex-1 text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]"
                  />
                  <input
                    type="color"
                    value={d.headerColour || '#2A3A5C'}
                    onChange={(e) => setDays((ds) => ds.map((x, j) => j === i ? { ...x, headerColour: e.target.value } : x))}
                    title="Header colour (optional)"
                    className="w-8 h-8 rounded cursor-pointer border border-gray-300 flex-shrink-0"
                  />
                  <button onClick={() => setDays((ds) => ds.filter((_, j) => j !== i))} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setDays((d) => [...d, { calendarDate: '', label: '', headerColour: '' }])}
              className="mt-3 flex items-center gap-2 text-sm text-[#1A1A2E] hover:underline"
            >
              <Plus className="w-4 h-4" /> Add day
            </button>
          </div>
        )}

        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => navigate('/projects')}>Cancel</Button>
          )}
          {step < 3 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={step === 1 && !name.trim()}>
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={() => createProject.mutate()} loading={createProject.isPending} disabled={!name.trim()}>
              Create Project
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
