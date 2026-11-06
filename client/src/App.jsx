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
// M1-B Provider management
import { ProviderProfilePage } from './pages/m1b-providers/ProviderProfilePage.jsx';
import { ProviderPackagesPage } from './pages/m1b-providers/ProviderPackagesPage.jsx';
import { ProviderAvailabilityPage } from './pages/m1b-providers/ProviderAvailabilityPage.jsx';
import { ProviderCredentialsPage } from './pages/m1b-providers/ProviderCredentialsPage.jsx';
import { ProviderDirectoryPage } from './pages/m1b-providers/ProviderDirectoryPage.jsx';
import { ProviderPublicPage } from './pages/m1b-providers/ProviderPublicPage.jsx';
import { AdminCredentialsPage } from './pages/m1b-providers/AdminCredentialsPage.jsx';

// Every page of the app and its URL. Pages inside <AppShell> get the sidebar and top bar.
export default function App() {
  const only = (roles, page) => <RequireRole roles={roles}>{page}</RequireRole>;

  return (
    <Routes>
      {/* Public pages */}
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><SignupPage /></GuestOnly>} />

      {/* Logged-in pages */}
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />

        {/* M1-B */}
        <Route path="provider/profile" element={only(['provider'], <ProviderProfilePage />)} />
        <Route path="provider/packages" element={only(['provider'], <ProviderPackagesPage />)} />
        <Route path="provider/availability" element={only(['provider'], <ProviderAvailabilityPage />)} />
        <Route path="provider/credentials" element={only(['provider'], <ProviderCredentialsPage />)} />
        <Route path="providers" element={only(['host', 'admin'], <ProviderDirectoryPage />)} />
        <Route path="providers/:id" element={<ProviderPublicPage />} />
        <Route path="admin/credentials" element={only(['admin'], <AdminCredentialsPage />)} />

        <Route path="admin/approvals" element={only(['admin'], <ApprovalsPage />)} />
        <Route path="admin/audit" element={only(['admin'], <AuditLogPage />)} />
        <Route path="admin/settings" element={only(['admin'], <AdminSettingsPage />)} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
