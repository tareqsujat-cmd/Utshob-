import { useAuth } from '../../hooks/useAuth.js';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { PageHeader, StatTile, Alert } from '../../components/ui/Layout.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { LoadingState, ErrorState } from '../../components/ui/States.jsx';
import { BookabilityPanel } from '../m1b-providers/BookabilityPanel.jsx';
import { formatDateTime, formatTaka } from '../../components/ui/format.js';

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
            {user.role === 'host' && plan && data.summary.events && (
              <>
                <StatTile label="Active events" value={`${data.summary.events.active} / ${data.summary.events.limit}`} icon="calendar" hint={`${plan.name} plan`} />
                <StatTile label="All my events" value={data.summary.events.total} icon="list" />
              </>
            )}
            {user.role === 'admin' && (
              <>
                <StatTile label="Accounts waiting for approval" value={data.summary.pendingApprovals} icon="users" tone="warning" />
                <StatTile label="Credentials to review" value={data.summary.pendingCredentials} icon="shield" tone="warning" />
                <StatTile label="Approved organizations" value={data.summary.approvedOrganizations} icon="home" tone="success" />
              </>
            )}
            {data.summary.surplus && (
              <StatTile label="My open surplus listings" value={data.summary.surplus.openListings} icon="leaf" tone="success" />
            )}
            {data.summary.coordinator && (
              <>
                <StatTile label="Open food requests" value={data.summary.coordinator.openRequests} icon="inbox" />
                <StatTile label="Active reservations" value={data.summary.coordinator.activeReservations} icon="check" tone="success" />
                <StatTile label={`Open surplus in ${data.summary.coordinator.organization.division}`} value={data.summary.coordinator.listingsInDivision} icon="leaf" tone="warning" />
              </>
            )}
            {data.summary.pickups && (
              <>
                <StatTile label="Active pickups" value={data.summary.pickups.active} icon="truck" tone="warning" />
                <StatTile label="Pickups completed" value={data.summary.pickups.completed} icon="check" tone="success" />
                <StatTile label="Telegram" value={data.summary.pickups.telegramConnected ? 'On' : 'Off'} icon="send" hint={data.summary.pickups.telegramConnected ? 'Reminders arrive on Telegram' : 'Connect it on your profile'} />
              </>
            )}
            {user.role === 'provider' && data.summary.provider && (
              <>
                <StatTile label="Active packages" value={data.summary.provider.activePackages} icon="file" />
                <StatTile label="Documents waiting for review" value={data.summary.provider.pendingCredentials} icon="shield" tone="warning" />
                <StatTile label="Upcoming blocked dates" value={data.summary.provider.upcomingBlockedDates} icon="calendar" />
              </>
            )}
          </div>

          {user.role === 'admin' && <AdminOverview summary={data.summary} roleLabels={meta?.roleLabels} />}
          {user.role === 'provider' && <ProviderOverview provider={data.summary.provider} />}
          {user.role === 'host' && <HostOverview nextEvent={data.summary.nextEvent} />}
          {data.summary.coordinator && user.approvalStatus === 'approved' && (
            <Card>
              <CardHeader title={data.summary.coordinator.organization.name} subtitle="Find surplus that fits what you can receive and carry." />
              <div className="flex flex-wrap gap-2">
                <ButtonLink to="/food-requests" icon="inbox">My food requests</ButtonLink>
                <ButtonLink to="/surplus" variant="secondary" icon="leaf">Available surplus</ButtonLink>
                <ButtonLink to="/tasks" variant="secondary" icon="truck">Collections ({data.summary.coordinator.activeCollections} active)</ButtonLink>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// M1-A: host home: the next event with its key numbers.
function HostOverview({ nextEvent }) {
  if (!nextEvent) {
    return (
      <Card>
        <CardHeader title="No upcoming event" subtitle="Plan an event to set guests, budget, menu and invitations." />
        <ButtonLink to="/events/new" icon="plus">Plan an event</ButtonLink>
      </Card>
    );
  }
  const remaining = nextEvent.budgetTotal - nextEvent.estimated;
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wider text-accent">Next event · {formatDateTime(nextEvent.startsAt)}</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{nextEvent.title}</h2>
          <p className="text-sm text-muted">{nextEvent.location.district}, {nextEvent.location.division}</p>
        </div>
        <ButtonLink to={`/events/${nextEvent._id}`} icon="chevronRight">Open event</ButtonLink>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Budget" value={formatTaka(nextEvent.budgetTotal)} icon="wallet" />
        <StatTile label="Estimated costs" value={formatTaka(nextEvent.estimated)} icon="chart" tone="accent" />
        <StatTile label="Not yet allocated" value={formatTaka(remaining)} icon="sparkles" tone={remaining < 0 ? 'danger' : 'primary'} />
        <StatTile label="Confirmed guests" value={`${nextEvent.confirmedGuests} / ${nextEvent.guestCount}`} icon="users" tone="success" />
      </div>
    </Card>
  );
}

// M1-B: provider home: create the profile first, then see whether bookings are allowed.
function ProviderOverview({ provider }) {
  if (!provider) {
    return (
      <Card>
        <CardHeader title="Set up your business" subtitle="Create your profile, add packages and upload your documents to start receiving quote requests." />
        <ButtonLink to="/provider/profile" icon="store">Create business profile</ButtonLink>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <BookabilityPanel bookability={provider.bookability} own />
      <div className="flex flex-wrap gap-2">
        <ButtonLink to="/provider/packages" variant="secondary" icon="file">Manage packages</ButtonLink>
        <ButtonLink to="/provider/credentials" variant="secondary" icon="shield">Credentials</ButtonLink>
      </div>
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
