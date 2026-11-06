import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { useAuth } from '../../hooks/useAuth.js';
import { fieldErrors } from '../../api/client.js';
import { eventsApi } from '../../api/m1a.events.api.js';
import { Alert } from '../../components/ui/Layout.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Input, Textarea } from '../../components/ui/Field.jsx';
import { LoadingState, ErrorState } from '../../components/ui/States.jsx';
import { formatDateTime, formatTaka, toLocalInput, fromLocalInput } from '../../components/ui/format.js';

const TABS = [
  { to: '', label: 'Overview', icon: 'home' },
  { to: 'budget', label: 'Budget', icon: 'wallet' },
  { to: 'food', label: 'Food plan', icon: 'utensils' },
  { to: 'invitation', label: 'Invitation & RSVPs', icon: 'send' },
  { to: 'history', label: 'History', icon: 'clock' },
];

// M1-A: the frame of one event's pages: header with actions, tabs, and the current tab (<Outlet />).
// Tabs receive the event through useOutletContext().
export function EventLayout() {
  const { id } = useParams();
  const meta = useMeta();
  const { user } = useAuth();
  const location = useLocation();
  const { data, loading, error, reload } = useFetch(`/events/${id}`);
  const [dialog, setDialog] = useState(null); // 'cancel' | 'reschedule' | 'copy'
  const [actionError, setActionError] = useState(null);

  if ((loading && !data) || !meta) return <LoadingState />; // reloads keep showing the old data
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { event, permissions } = data;
  const started = new Date(event.startsAt) <= new Date();

  async function runAction(action) {
    setActionError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <div>
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">{meta.eventTypeLabels[event.eventType]}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold md:text-3xl">{event.title}</h1>
          <StatusBadge status={event.status} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
          <span className="flex items-center gap-1.5"><Icon name="calendar" size={15} /> {formatDateTime(event.startsAt)}</span>
          <span className="flex items-center gap-1.5"><Icon name="mapPin" size={15} /> {event.location.district}, {event.location.division}</span>
          <span className="flex items-center gap-1.5"><Icon name="users" size={15} /> {event.guestCount} guests</span>
          <span className="flex items-center gap-1.5"><Icon name="wallet" size={15} /> {formatTaka(event.budgetTotal)}</span>
        </div>

        {user.role === 'host' && (
          <div className="mt-4 flex flex-wrap gap-2">
            {permissions.canEdit && <ButtonLink to={`/events/${event._id}/edit`} variant="secondary" size="sm" icon="edit">Edit</ButtonLink>}
            {permissions.canEdit && event.status === 'draft' && (
              <Button size="sm" icon="check" onClick={() => runAction(() => eventsApi.markPlanned(event._id))}>Mark as planned</Button>
            )}
            <Button variant="secondary" size="sm" icon="copy" onClick={() => setDialog('copy')}>Copy to new event</Button>
            {permissions.isOwner && permissions.canEdit && (
              <>
                <Button variant="secondary" size="sm" icon="calendar" onClick={() => setDialog('reschedule')}>Reschedule</Button>
                {event.status === 'planned' && started && (
                  <Button size="sm" icon="check" onClick={() => runAction(() => eventsApi.markCompleted(event._id))}>Mark completed</Button>
                )}
                <Button variant="ghost" size="sm" icon="ban" onClick={() => setDialog('cancel')}>Cancel event</Button>
              </>
            )}
          </div>
        )}
      </header>

      <div className="mb-6 space-y-3">
        {location.state?.message && <Alert tone="info">{location.state.message}</Alert>}
        {actionError && <Alert tone="danger">{actionError}</Alert>}
        {event.status === 'cancelled' && (
          <Alert tone="danger" title="This event was cancelled">
            Reason: {event.cancelReason}. Its records are kept for review and can no longer be changed.
          </Alert>
        )}
        {event.status === 'completed' && <Alert tone="success" title="This event is completed">Its records are kept read-only.</Alert>}
        {event.copiedFrom && event.status === 'draft' && (
          <Alert tone="warning" title="Copied from a previous event">Prices and provider availability may have changed. Check the budget before planning.</Alert>
        )}
      </div>

      <nav className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0" aria-label="Event sections">
        <ul className="flex min-w-max gap-1">
          {TABS.map((tab) => (
            <li key={tab.label}>
              <NavLink
                to={tab.to}
                end
                className={({ isActive }) =>
                  `flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold ${isActive ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`
                }
              >
                <Icon name={tab.icon} size={16} /> {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet context={{ event, permissions, reloadEvent: reload }} />

      {dialog === 'cancel' && <CancelDialog event={event} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog === 'reschedule' && <RescheduleDialog event={event} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog === 'copy' && <CopyDialog event={event} onClose={() => setDialog(null)} />}
    </div>
  );
}

// Shared logic of the three dialogs: call the API, show field errors, close on success.
function useDialogSubmit(onSuccess) {
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(call) {
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const result = await call();
      onSuccess(result);
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.message);
      setBusy(false);
    }
  }
  return { errors, error, busy, submit };
}

function CancelDialog({ event, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const { errors, error, busy, submit } = useDialogSubmit(() => { onClose(); onDone(); });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Cancel ${event.title}?`}
      footer={<><Button variant="secondary" onClick={onClose}>Keep event</Button><Button variant="danger" loading={busy} onClick={() => submit(() => eventsApi.cancel(event._id, reason))}>Cancel event</Button></>}
    >
      <p className="mb-4 text-sm">Organizers are notified. Budgets, food plans and RSVPs are kept for review, never deleted.</p>
      <Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
      {error && !errors.reason && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
    </Modal>
  );
}

function RescheduleDialog({ event, onClose, onDone }) {
  const [form, setForm] = useState({ startsAt: toLocalInput(event.startsAt), endsAt: toLocalInput(event.endsAt), reason: '' });
  const { errors, error, busy, submit } = useDialogSubmit(() => { onClose(); onDone(); });
  const save = () => submit(() => eventsApi.reschedule(event._id, { startsAt: fromLocalInput(form.startsAt), endsAt: fromLocalInput(form.endsAt), reason: form.reason }));
  return (
    <Modal open onClose={onClose} title="Reschedule event" footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button loading={busy} onClick={save}>Reschedule</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="New start" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} error={errors.startsAt} />
        <Input label="New end" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} error={errors.endsAt} />
        <Textarea label="Reason" required className="sm:col-span-2" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} error={errors.reason} />
      </div>
      {error && Object.keys(errors).length === 0 && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
    </Modal>
  );
}

function CopyDialog({ event, onClose }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: `${event.title} (copy)`, startsAt: '', endsAt: '' });
  const { errors, error, busy, submit } = useDialogSubmit((result) => navigate(`/events/${result.event._id}`));
  const save = () => submit(() => eventsApi.copy(event._id, { title: form.title, startsAt: fromLocalInput(form.startsAt), endsAt: fromLocalInput(form.endsAt) }));
  return (
    <Modal open onClose={onClose} title="Copy into a new draft" footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button loading={busy} icon="copy" onClick={save}>Create draft</Button></>}>
      <p className="mb-4 text-sm text-muted">Guests, budget, menu, dietary needs and services are copied. Bookings and RSVPs are not.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Title" className="sm:col-span-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} error={errors.title} />
        <Input label="Starts" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} error={errors.startsAt} />
        <Input label="Ends" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} error={errors.endsAt} />
      </div>
      {error && Object.keys(errors).length === 0 && <div className="mt-3"><Alert tone={error.includes('plan allows') ? 'warning' : 'danger'}>{error}</Alert></div>}
    </Modal>
  );
}
