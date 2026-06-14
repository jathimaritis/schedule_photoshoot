import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { setAccessToken } from './api/client';
import { authApi } from './api/auth';
import { User } from './types';
import { ShieldOff, LogOut } from 'lucide-react';

// Auth pages
import LoginPage from './pages/auth/LoginPage';
import AcceptInvitePage from './pages/auth/AcceptInvitePage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';

// App pages
import AppLayout from './components/layout/AppLayout';
import ProjectListPage from './pages/projects/ProjectListPage';
import NewProjectPage from './pages/projects/NewProjectPage';
import ProjectOverviewPage from './pages/projects/ProjectOverviewPage';
import ScheduleBuilderPage from './pages/projects/ScheduleBuilderPage';
import CallSheetsPage from './pages/projects/CallSheetsPage';
import CallSheetEditorPage from './pages/projects/CallSheetEditorPage';
import ExportPage from './pages/projects/ExportPage';
import SettingsPage from './pages/settings/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/admin/AdminPage';
import CallSheetListPage from './pages/callsheet/CallSheetListPage';
import CallSheetEditPage from './pages/callsheet/CallSheetEditPage';

// ─── helpers ──────────────────────────────────────────────────────────────────

function canScheduler(user: User) {
  return user.role === 'ADMIN' || user.moduleAccess === 'SCHEDULER' || user.moduleAccess === 'BOTH';
}

function canCallSheet(user: User) {
  return user.role === 'ADMIN' || user.moduleAccess === 'CALLSHEET' || user.moduleAccess === 'BOTH';
}

// ─── No-access page ───────────────────────────────────────────────────────────

function NoAccessPage() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  return (
    <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-10 text-center max-w-sm w-full">
        <ShieldOff className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-900 mb-2">Access not available</h2>
        <p className="text-sm text-gray-500 mb-6">
          You do not have access to this module. Please contact the administrator.
        </p>
        <button
          onClick={() => { clearAuth(); window.location.href = '/login'; }}
          className="flex items-center gap-2 mx-auto text-sm text-gray-600 hover:text-gray-900"
        >
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </div>
    </div>
  );
}

// ─── guards ───────────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireScheduler({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!canScheduler(user)) return <NoAccessPage />;
  return <>{children}</>;
}

function RequireCallSheet({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!canCallSheet(user)) return <NoAccessPage />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (canScheduler(user)) return <Navigate to="/projects" replace />;
  if (canCallSheet(user)) return <Navigate to="/call-sheet" replace />;
  return <NoAccessPage />;
}

// ─── app ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { user, updateUser } = useAuthStore();

  useEffect(() => {
    if (user) {
      authApi.refresh()
        .then((data) => {
          setAccessToken(data.accessToken);
          if (data.user) updateUser(data.user);
        })
        .catch(() => useAuthStore.getState().clearAuth());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

        {/* Protected app routes */}
        <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<RootRedirect />} />

          {/* Scheduler module */}
          <Route path="projects" element={<RequireScheduler><ProjectListPage /></RequireScheduler>} />
          <Route path="projects/new" element={<RequireScheduler><NewProjectPage /></RequireScheduler>} />
          <Route path="projects/:id" element={<RequireScheduler><ProjectOverviewPage /></RequireScheduler>} />
          <Route path="projects/:id/schedule" element={<RequireScheduler><ScheduleBuilderPage /></RequireScheduler>} />
          <Route path="projects/:id/callsheets" element={<RequireScheduler><CallSheetsPage /></RequireScheduler>} />
          <Route path="projects/:id/callsheets/:dayId" element={<RequireScheduler><CallSheetEditorPage /></RequireScheduler>} />
          <Route path="projects/:id/export" element={<RequireScheduler><ExportPage /></RequireScheduler>} />

          {/* Call Sheet module */}
          <Route path="call-sheet" element={<RequireCallSheet><CallSheetListPage /></RequireCallSheet>} />
          <Route path="call-sheet/:id" element={<RequireCallSheet><CallSheetEditPage /></RequireCallSheet>} />

          {/* Admin */}
          <Route path="admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />

          {/* Common */}
          <Route path="settings" element={<SettingsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
