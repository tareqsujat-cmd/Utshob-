import { Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell.jsx';
import { RequireAuth, GuestOnly, RequireRole } from './components/layout/RouteGuards.jsx';
import { LoginPage } from './pages/common/LoginPage.jsx';
import { SignupPage } from './pages/common/SignupPage.jsx';
import { DashboardPage } from './pages/common/DashboardPage.jsx';
import { ProfilePage } from './pages/common/ProfilePage.jsx';
import { NotFoundPage } from './pages/common/NotFoundPage.jsx';
import { ApprovalsPage } from './pages/admin/ApprovalsPage.jsx';
import { AuditLogPage } from './pages/admin/AuditLogPage.jsx';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage.jsx';

// Every page of the app and its URL. Pages inside <AppShell> get the sidebar and top bar.
export default function App() {
  const adminOnly = (page) => <RequireRole roles={['admin']}>{page}</RequireRole>;

  return (
    <Routes>
      {/* Public pages */}
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><SignupPage /></GuestOnly>} />

      {/* Logged-in pages */}
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />

        <Route path="admin/approvals" element={adminOnly(<ApprovalsPage />)} />
        <Route path="admin/audit" element={adminOnly(<AuditLogPage />)} />
        <Route path="admin/settings" element={adminOnly(<AdminSettingsPage />)} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
