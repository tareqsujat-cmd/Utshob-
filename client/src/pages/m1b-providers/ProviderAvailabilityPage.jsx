import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch.js';
import { providersApi } from '../../api/m1b.providers.api.js';
import { PageHeader, Alert } from '../../components/ui/Layout.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { formatDate } from '../../components/ui/format.js';

const toDay = (value) => new Date(value).toISOString().slice(0, 10); // "2026-12-20"

// M1-B: dates the provider is unavailable. Confirmed bookings (M3-C) also block dates.
export function ProviderAvailabilityPage() {
  const { data, loading, error, reload } = useFetch('/providers/me');
  const [newDate, setNewDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const provider = data?.provider;
  const today = toDay(new Date());
  const blocked = provider?.blockedDates || [];

  // Every change sends the whole new list to the server (PUT replaces it).
  async function saveList(list) {
    setBusy(true);
    setActionError(null);
    try {
      await providersApi.saveBlockedDates(list.map((b) => ({ date: toDay(b.date), reason: b.reason })));
      reload();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function addDate(e) {
    e.preventDefault();
    if (blocked.some((b) => toDay(b.date) === newDate)) {
      setActionError('That date is already blocked.');
      return;
    }
    saveList([...blocked, { date: newDate, reason }]);
    setNewDate('');
    setReason('');
  }

  return (
    <div>
      <PageHeader eyebrow="My business" title="Availability" subtitle="Block dates when you cannot take events (holidays, maintenance, private use)." />
      {loading && <LoadingState />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && !provider && (
        <Card>
          <EmptyState icon="store" title="Create your business profile first" action={<ButtonLink to="/provider/profile">Create profile</ButtonLink>} />
        </Card>
      )}

      {provider && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Card>
            <CardHeader title="Block a date" />
            <form onSubmit={addDate} className="space-y-4">
              <Input label="Date" type="date" required min={today} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              <Input label="Reason (only you see this)" placeholder="e.g. Hall renovation" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button type="submit" icon="plus" loading={busy} disabled={!newDate}>Block date</Button>
            </form>
            {actionError && <div className="mt-4"><Alert tone="danger">{actionError}</Alert></div>}
          </Card>

          <Card>
            <CardHeader title="Blocked dates" subtitle={`${blocked.filter((b) => toDay(b.date) >= today).length} upcoming`} />
            {blocked.length === 0 && <p className="py-6 text-center text-sm text-muted">No blocked dates. You are shown as available every day.</p>}
            <ul className="divide-y divide-line">
              {blocked.map((b) => {
                const past = toDay(b.date) < today;
                return (
                  <li key={b._id} className={`flex items-center gap-3 py-3 ${past ? 'opacity-50' : ''}`}>
                    <Icon name="calendar" size={18} className="text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{formatDate(b.date)}{past && ' (past)'}</p>
                      {b.reason && <p className="truncate text-xs text-muted">{b.reason}</p>}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => saveList(blocked.filter((x) => x._id !== b._id))}
                      className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                      aria-label={`Unblock ${formatDate(b.date)}`}
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
