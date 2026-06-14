import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { setAccessToken } from './api/client';
import { authApi } from './api/auth';

// Auth pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
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
import UsersPage from './pages/settings/UsersPage';
import ProfilePage from './pages/ProfilePage';
import StatusBlockPage from './pages/StatusBlockPage';
import AdminPage from './pages/admin/AdminPage';
import CallSheetListPage from './pages/callsheet/CallSheetListPage';
import CallSheetEditPage from './pages/callsheet/CallSheetEditPage';
import { User } from './types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function isAdmin(user: User) {
  return user.isAdmin === true || user.role === 'OWNER' || user.role === 'ADMIN';
}

function canAccessScheduler(user: User) {
  return isAdmin(user) || (user.status === 'APPROVED' && user.accessScheduler === true);
}

function canAccessCallSheet(user: User) {
  return isAdmin(user) || (user.status === 'APPROVED' && user.accessCallSheet === true);
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
  if (user.status === 'PENDING') return <StatusBlockPage status="PENDING" />;
  if (user.status === 'RESTRICTED') return <StatusBlockPage status="RESTRICTED" />;
  if (!canAccessScheduler(user)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireCallSheet({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.status === 'PENDING') return <StatusBlockPage status="PENDING" />;
  if (user.status === 'RESTRICTED') return <StatusBlockPage status="RESTRICTED" />;
  if (!canAccessCallSheet(user)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin(user)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Root redirect: check status and access flags */
function RootRedirect() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.status === 'PENDING') return <StatusBlockPage status="PENDING" />;
  if (user.status === 'RESTRICTED') return <StatusBlockPage status="RESTRICTED" />;
  if (canAccessScheduler(user)) return <Navigate to="/projects" replace />;
  if (canAccessCallSheet(user)) return <Navigate to="/call-sheet" replace />;
  return <StatusBlockPage status="PENDING" />;
}

// ─── app ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { user, setAuth, updateUser } = useAuthStore();

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

  // Suppress unused warning
  void setAuth;

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
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
          <Route path="settings/users" element={<UsersPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
