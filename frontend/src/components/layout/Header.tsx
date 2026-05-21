import { Menu, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { useLocation, Link, useParams } from 'react-router-dom';
import { useUiStore } from '../../stores/uiStore';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../../api/projects';
import { useAuthStore } from '../../stores/authStore';
import clsx from 'clsx';

function SaveIndicator() {
  const status = useUiStore((s) => s.saveStatus);
  if (status === 'idle') return null;
  return (
    <div className="flex items-center gap-1 text-xs">
      {status === 'saving' && (
        <><Loader2 className="w-3 h-3 animate-spin text-gray-400" /> <span className="text-gray-400">Saving…</span></>
      )}
      {status === 'saved' && (
        <><CheckCircle className="w-3 h-3 text-green-500" /> <span className="text-green-600">Saved</span></>
      )}
      {status === 'error' && (
        <><AlertCircle className="w-3 h-3 text-red-500" /> <span className="text-red-600">Save failed</span></>
      )}
    </div>
  );
}

export default function Header() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const location = useLocation();
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  });

  // Build breadcrumbs
  const crumbs: { label: string; to?: string }[] = [];
  if (user?.organisation?.name) crumbs.push({ label: user.organisation.name });
  if (project) crumbs.push({ label: project.name, to: `/projects/${project.id}` });

  const pathParts = location.pathname.split('/').filter(Boolean);
  const lastPart = pathParts[pathParts.length - 1];
  const pageLabels: Record<string, string> = {
    schedule: 'Schedule',
    callsheets: 'Call Sheets',
    export: 'Export',
    settings: 'Settings',
    users: 'Team',
    profile: 'Profile',
    new: 'New Project',
  };
  if (pageLabels[lastPart]) crumbs.push({ label: pageLabels[lastPart] });

  return (
    <header className="h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 gap-4 flex-shrink-0 no-print">
      <button
        onClick={toggleSidebar}
        className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
        aria-label="Toggle sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm min-w-0">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300 dark:text-gray-600">/</span>}
            {crumb.to ? (
              <Link to={crumb.to} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 truncate max-w-[160px]">
                {crumb.label}
              </Link>
            ) : (
              <span className={clsx('truncate max-w-[200px]', i === crumbs.length - 1 ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-500 dark:text-gray-400')}>
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      <div className="ml-auto">
        <SaveIndicator />
      </div>
    </header>
  );
}
