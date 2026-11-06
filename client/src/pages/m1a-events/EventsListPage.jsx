import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Input, Select } from '../../components/ui/Field.jsx';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { formatDateTime, formatTaka } from '../../components/ui/format.js';

// M1-A: my events, with search by title, status and date range.
export function EventsListPage() {
  const { user } = useAuth();
  const meta = useMeta();
  const [filters, setFilters] = useState({ q: '', status: '', from: '', to: '' });
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  const { data, loading, error, reload } = useFetch(`/events?${params}`);
  const update = (changes) => setFilters((current) => ({ ...current, ...changes }));

  const usage = data?.usage;
  const atLimit = usage && usage.activeEvents >= usage.limit;

  return (
    <div>
      <PageHeader
        eyebrow="Plan"
        title={user.role === 'admin' ? 'All events' : 'My events'}
        subtitle="Search previous events, copy one into a new draft, or plan a new event."
        actions={user.role === 'host' && <ButtonLink to="/events/new" icon="plus">Plan an event</ButtonLink>}
      />

      {user.role === 'host' && usage && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={atLimit ? 'warning' : 'primary'}>
            {usage.activeEvents} of {usage.limit} active event{usage.limit === 1 ? '' : 's'} · {usage.planName} plan
          </Badge>
          {atLimit && <span className="text-muted">Complete or cancel an event, or upgrade your plan, to add another.</span>}
        </div>
      )}

      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Search" placeholder="Event title" value={filters.q} onChange={(e) => update({ q: e.target.value })} />
          <Select
            label="Status"
            value={filters.status}
            placeholder="Any status"
            options={(meta?.eventStatuses || []).map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))}
            onChange={(e) => update({ status: e.target.value })}
          />
          <Input label="From" type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} />
          <Input label="To" type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} />
        </div>
      </Card>

      {loading && <LoadingState />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.events.length === 0 && (
        <Card>
          <EmptyState icon="calendar" title="No events found" message="Plan your first event, or change the filters." action={user.role === 'host' && <ButtonLink to="/events/new" icon="plus">Plan an event</ButtonLink>} />
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {data && meta && data.events.map((event) => (
          <Link key={event._id} to={`/events/${event._id}`} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-accent">{meta.eventTypeLabels[event.eventType]}</span>
                <StatusBadge status={event.status} />
              </div>
              <h2 className="mt-1 text-xl font-semibold group-hover:text-primary">{event.title}</h2>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted"><Icon name="calendar" size={14} /> {formatDateTime(event.startsAt)}</p>
              <p className="flex items-center gap-1.5 text-sm text-muted"><Icon name="mapPin" size={14} /> {event.location.district}, {event.location.division}</p>
              <div className="mt-4 flex gap-6 text-sm">
                <span><strong>{event.guestCount}</strong> guests</span>
                <span>Budget <strong>{formatTaka(event.budgetTotal)}</strong></span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
