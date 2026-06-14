import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, FolderOpen, Settings, Calendar, FileText, Download, LogOut, X, ChevronDown, ClipboardList, Shield } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { projectsApi } from '../../api/projects';
import { authApi } from '../../api/auth';
import { User } from '../../types';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-400',
  ACTIVE: 'bg-green-500',
  COMPLETED: 'bg-blue-500',
  ARCHIVED: 'bg-gray-300',
};

function canScheduler(user: User) {
  return user.role === 'ADMIN' || user.moduleAccess === 'SCHEDULER' || user.moduleAccess === 'BOTH';
}

function canCallSheet(user: User) {
  return user.role === 'ADMIN' || user.moduleAccess === 'CALLSHEET' || user.moduleAccess === 'BOTH';
}

export default function Sidebar() {
  const { id: currentProjectId } = useParams();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const [schedulerOpen, setSchedulerOpen] = useState(true);

  const isAdmin = user?.role === 'ADMIN';
  const showScheduler = user ? canScheduler(user) : false;
  const showCallSheet = user ? canCallSheet(user) : false;

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
    enabled: !!user && showScheduler,
  });

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  if (!sidebarOpen) {
    return <div className="fixed left-0 top-0 h-full w-0 z-30" />;
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-[#1A1A2E] text-white flex flex-col z-30 no-print">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-[#D4AF37]" />
          <span className="font-semibold text-[#D4AF37] text-sm tracking-wide">SHOOT SCHEDULER</span>
        </div>
        <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-white/60 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Org name */}
      <div className="px-4 py-2 border-b border-white/10">
        <p className="text-xs text-white/50 uppercase tracking-wider">Organisation</p>
        <p className="text-sm text-white/80 truncate">{user?.organisation?.name ?? '—'}</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-thin">
        {/* Scheduler section */}
        {showScheduler && (
          <div className="px-3 mb-1">
            <button
              onClick={() => setSchedulerOpen((o) => !o)}
              className="w-full flex items-center justify-between px-1 mb-1 text-xs text-white/40 uppercase tracking-wider hover:text-white/60 transition-colors"
            >
              <span>Scheduler</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${schedulerOpen ? '' : '-rotate-90'}`} />
            </button>

            {schedulerOpen && (
              <div className="space-y-0.5">
                <NavLink
                  to="/projects"
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white hover:bg-white/5'}`
                  }
                >
                  <FolderOpen className="w-4 h-4" /> All Projects
                </NavLink>

                {currentProjectId && (
                  <div className="mt-1 ml-1 border-l border-white/10 pl-2">
                    {[
                      { to: `/projects/${currentProjectId}`, icon: <FolderOpen className="w-3.5 h-3.5" />, label: 'Overview' },
                      { to: `/projects/${currentProjectId}/schedule`, icon: <Calendar className="w-3.5 h-3.5" />, label: 'Schedule' },
                      { to: `/projects/${currentProjectId}/callsheets`, icon: <FileText className="w-3.5 h-3.5" />, label: 'Call Sheets' },
                      { to: `/projects/${currentProjectId}/export`, icon: <Download className="w-3.5 h-3.5" />, label: 'Export' },
                    ].map(({ to, icon, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={to.endsWith(currentProjectId)}
                        className={({ isActive }) =>
                          `flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors ${isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`
                        }
                      >
                        {icon} {label}
                      </NavLink>
                    ))}
                  </div>
                )}

                {projects && projects.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-white/30 uppercase tracking-wider px-3 mb-1">Recent</p>
                    {projects.slice(0, 5).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/projects/${p.id}`)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-left transition-colors ${currentProjectId === p.id ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_COLORS[p.status] ?? 'bg-gray-400'}`} />
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Call Sheet module */}
        {showCallSheet && (
          <div className="px-3 mt-2">
            <p className="text-xs text-white/40 uppercase tracking-wider px-1 mb-1">Call Sheet</p>
            <NavLink
              to="/call-sheet"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white hover:bg-white/5'}`
              }
            >
              <ClipboardList className="w-4 h-4" /> Production Call Sheets
            </NavLink>
          </div>
        )}
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-white/10 py-2 px-3">
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white hover:bg-white/5'}`
            }
          >
            <Shield className="w-4 h-4" /> Admin
          </NavLink>
        )}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white hover:bg-white/5'}`
          }
        >
          <Settings className="w-4 h-4" /> Settings
        </NavLink>

        {/* User info */}
        <div className="mt-2 border-t border-white/10 pt-2">
          <NavLink
            to="/profile"
            className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/5 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[#D4AF37] flex items-center justify-center text-[#1A1A2E] font-bold text-xs flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-white/40 truncate">{user?.role}</p>
            </div>
          </NavLink>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
      </div>
    </aside>
  );
}
