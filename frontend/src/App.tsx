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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

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
          <Route index element={<Navigate to="/projects" replace />} />
          <Route path="projects" element={<ProjectListPage />} />
          <Route path="projects/new" element={<NewProjectPage />} />
          <Route path="projects/:id" element={<ProjectOverviewPage />} />
          <Route path="projects/:id/schedule" element={<ScheduleBuilderPage />} />
          <Route path="projects/:id/callsheets" element={<CallSheetsPage />} />
          <Route path="projects/:id/callsheets/:dayId" element={<CallSheetEditorPage />} />
          <Route path="projects/:id/export" element={<ExportPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/users" element={<UsersPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
