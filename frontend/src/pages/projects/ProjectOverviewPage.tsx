import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Camera, FileText, Download, Edit2, Check } from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';
import { projectsApi } from '../../api/projects';
import Badge from '../../components/ui/Badge';
import Skeleton from '../../components/ui/Skeleton';
import Select from '../../components/ui/Select';
import toast from 'react-hot-toast';

export default function ProjectOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingStatus, setEditingStatus] = useState(false);

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { status: string }) => projectsApi.update(id!, data as Parameters<typeof projectsApi.update>[1]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setEditingStatus(false);
      toast.success('Project updated');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!project) return <div className="text-red-500">Project not found</div>;

  const quickLinks = [
    { label: 'Schedule Builder', desc: 'Manage shots and assign to days', icon: Camera, to: `/projects/${id}/schedule`, color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
    { label: 'Call Sheets', desc: 'View and edit daily call sheets', icon: FileText, to: `/projects/${id}/callsheets`, color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    { label: 'Export', desc: 'Download schedule and call sheets', icon: Download, to: `/projects/${id}/export`, color: 'bg-amber-50 border-amber-200 text-amber-700' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{project.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            {project.clientName && <span className="text-sm text-gray-500">{project.clientName}</span>}
            {project.location && <span className="text-sm text-gray-400">· {project.location}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editingStatus ? (
            <div className="flex items-center gap-2">
              <Select
                value={project.status}
                onChange={(e) => updateMutation.mutate({ status: e.target.value })}
                options={[
                  { value: 'DRAFT', label: 'Draft' },
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'COMPLETED', label: 'Completed' },
                  { value: 'ARCHIVED', label: 'Archived' },
                ]}
                className="min-h-[36px] py-1"
              />
              <button onClick={() => setEditingStatus(false)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={() => setEditingStatus(true)} className="flex items-center gap-1.5 hover:opacity-80">
              <Badge label={project.status} />
              <Edit2 className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Shooting Days', value: project._count?.shootingDays ?? project.shootingDays?.length ?? 0, icon: Camera },
          { label: 'Total Shots', value: project._count?.shots ?? 0, icon: Camera },
          { label: 'Call Sheets', value: project._count?.callSheets ?? 0, icon: FileText },
          { label: 'Photography Types', value: project.photographyTypes?.length ?? 0, icon: Calendar },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
              <Icon className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wide">{label}</span>
            </div>
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</span>
          </div>
        ))}
      </div>

      {/* Dates */}
      {(project.startDate || project.endDate) && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Project Timeline</h3>
          <div className="flex gap-6 text-sm">
            {project.startDate && (
              <div>
                <span className="text-gray-500">Start</span>
                <span className="ml-2 font-medium">{format(new Date(project.startDate), 'dd MMM yyyy')}</span>
              </div>
            )}
            {project.endDate && (
              <div>
                <span className="text-gray-500">End</span>
                <span className="ml-2 font-medium">{format(new Date(project.endDate), 'dd MMM yyyy')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Photography types */}
      {project.photographyTypes && project.photographyTypes.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Photography Types</h3>
          <div className="flex flex-wrap gap-2">
            {project.photographyTypes.map((t) => (
              <span key={t.id} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm text-white font-medium" style={{ backgroundColor: t.hexColour }}>
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Quick Access</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {quickLinks.map(({ label, desc, icon: Icon, to, color }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className={`flex items-start gap-3 p-4 rounded-xl border text-left hover:shadow-md transition-shadow ${color}`}
          >
            <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-sm">{label}</div>
              <div className="text-xs opacity-80 mt-0.5">{desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
