import { useAuth } from '../../hooks/useAuth.js';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { PageHeader, StatTile, Alert } from '../../components/ui/Layout.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { LoadingState, ErrorState } from '../../components/ui/States.jsx';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Home page after login. The numbers come from GET /api/dashboard for the user's role;
// each feature adds its own section here as it is built.
export function DashboardPage() {
  const { user, plan } = useAuth();
  const meta = useMeta();
  const { data, loading, error, reload } = useFetch('/dashboard');

  const firstName = user.name.split(' ')[0];

  return (
    <div>
      <PageHeader
        eyebrow={meta?.roleLabels?.[user.role]}
        title={`${greeting()}, ${firstName}`}
        subtitle="Here is what needs your attention today."
      />

      {user.approvalStatus === 'pending' && (
        <div className="mb-6">
          <Alert tone="warning" title="Your account is waiting for approval">
            An administrator will review your details soon. You can update your profile meanwhile; you will get a
            notification when a decision is made.
          </Alert>
        </div>
      )}
      {user.approvalStatus === 'rejected' && (
        <div className="mb-6">
          <Alert tone="danger" title="Your account was not approved">
            {user.approvalNote || 'Please contact an administrator.'}
          </Alert>
        </div>
      )}

      {loading && <LoadingState />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Unread notifications" value={data.summary.unreadNotifications} icon="bell" tone="accent" />
            {user.role === 'host' && plan && (
              <StatTile label="Current plan" value={plan.name} icon="card" hint={`${plan.limits.activeEvents} active event(s) allowed`} />
            )}
            {user.role === 'admin' && (
              <>
                <StatTile label="Waiting for approval" value={data.summary.pendingApprovals} icon="shield" tone="warning" />
                <StatTile label="Approved organizations" value={data.summary.approvedOrganizations} icon="home" tone="success" />
              </>
            )}
          </div>

          {user.role === 'admin' && <AdminOverview summary={data.summary} roleLabels={meta?.roleLabels} />}
        </div>
      )}
    </div>
  );
}

function AdminOverview({ summary, roleLabels }) {
  const total = summary.usersByRole.reduce((sum, row) => sum + row.count, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Accounts by role" subtitle={`${total} accounts in total`} />
        <ul className="space-y-3">
          {summary.usersByRole.map((row) => (
            <li key={row._id}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{roleLabels?.[row._id] || row._id}</span>
                <span className="font-semibold">{row.count}</span>
              </div>
              <div className="h-2 rounded-full bg-paper">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${(row.count / total) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Approval queue" subtitle="Providers and community organizations need a review before they can operate." />
        <p className="font-display text-4xl font-semibold">{summary.pendingApprovals}</p>
        <p className="mb-5 text-sm text-muted">waiting</p>
        <ButtonLink to="/admin/approvals" icon="shield">
          Review accounts
        </ButtonLink>
      </Card>
    </div>
  );
}
