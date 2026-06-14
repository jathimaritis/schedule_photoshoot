import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { setAccessToken } from './api/client';
import { authApi } from './api/auth';
import { ModuleAccess, Role } from './types';

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
import PendingApprovalPage from './pages/PendingApprovalPage';
import AdminPage from './pages/admin/AdminPage';
import CallSheetListPage from './pages/callsheet/CallSheetListPage';
import CallSheetEditPage from './pages/callsheet/CallSheetEditPage';

// ─── helpers ──────────────────────────────────────────────────────────────────

function isAdminRole(role: Role) {
  return role === 'OWNER' || role === 'ADMIN';
}

function canAccessScheduler(role: Role, moduleAccess: ModuleAccess | undefined) {
  // Treat missing access (pre-migration sessions) as BOTH to avoid locking out existing users
  return isAdminRole(role) || !moduleAccess || moduleAccess === 'SCHEDULER' || moduleAccess === 'BOTH';
}

function canAccessCallSheet(role: Role, moduleAccess: ModuleAccess | undefined) {
  return isAdminRole(role) || !moduleAccess || moduleAccess === 'CALL_SHEET' || moduleAccess === 'BOTH';
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
  if (!canAccessScheduler(user.role, user.moduleAccess)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireCallSheet({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccessCallSheet(user.role, user.moduleAccess)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminRole(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Smart root redirect: NONE → pending, else → best default module */
function RootRedirect() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminRole(user.role) && user.moduleAccess === 'NONE') {
    return <PendingApprovalPage />;
  }
  if (canAccessScheduler(user.role, user.moduleAccess)) {
    return <Navigate to="/projects" replace />;
  }
  if (canAccessCallSheet(user.role, user.moduleAccess)) {
    return <Navigate to="/call-sheet" replace />;
  }
  return <PendingApprovalPage />;
}

// ─── app ──────────────────────────────────────────────────────────────────────

export default function App() {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user) {
      authApi.refresh()
        .then((data) => setAccessToken(data.accessToken))
        .catch(() => useAuthStore.getState().clearAuth());
    }
  }, []);

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
