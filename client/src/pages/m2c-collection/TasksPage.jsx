import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { useFetch } from '../../hooks/useFetch.js';
import { fieldErrors } from '../../api/client.js';
import { collectionApi } from '../../api/m2c.collection.api.js';
import { newIdempotencyKey } from '../../api/m1c.surplus.api.js';
import { PageHeader, Alert } from '../../components/ui/Layout.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { formatDateTime, formatQty, toLocalInput, fromLocalInput } from '../../components/ui/format.js';

const NEXT = {
  assigned: ['en_route', 'delayed', 'collected', 'partially_collected', 'cancelled', 'missed'],
  en_route: ['delayed', 'collected', 'partially_collected', 'cancelled', 'missed'],
  delayed: ['en_route', 'collected', 'partially_collected', 'cancelled', 'missed'],
};
const ACTION_LABEL = { en_route: 'On the way', delayed: 'Delayed…', collected: 'Collected all…', partially_collected: 'Collected part…', cancelled: 'Cancel…', missed: 'Missed…' };
const COORDINATOR_ONLY = ['cancelled', 'missed'];
const DELIVERY_TONE = { sent: 'success', failed: 'danger', pending: 'warning', sending: 'warning' };

// M2-C: pickups. Coordinators assign and follow them; volunteers update their own.
// Works fully without Telegram: Telegram only adds a copy of the notifications.
export function TasksPage() {
  const { user } = useAuth();
  const isCoordinator = Boolean(user.organization);
  const isVolunteer = user.role === 'volunteer';
  const [tab, setTab] = useState('active');
  const { data, loading, error, reload } = useFetch(`/tasks?status=${tab}`);
  const [assigning, setAssigning] = useState(false);
  const [changing, setChanging] = useState(null); // { task, status }
  const [message, setMessage] = useState(null);

  async function quick(task, status) {
    setMessage(null);
    try {
      await collectionApi.setStatus(task._id, { status });
      reload();
    } catch (err) {
      setMessage({ tone: 'danger', text: err.message });
    }
  }

  async function reminders() {
    try {
      const r = await collectionApi.sendReminders();
      setMessage({ tone: 'info', text: `${r.remindersSent} reminder(s) sent for pickups in the next 3 hours.` });
      reload();
    } catch (err) {
      setMessage({ tone: 'danger', text: err.message });
    }
  }

  async function retry(notification) {
    try {
      const { notification: n } = await collectionApi.retryTelegram(notification._id);
      setMessage({ tone: n.telegram.status === 'sent' ? 'success' : 'warning', text: n.telegram.status === 'sent' ? 'Sent on Telegram.' : `Still failing: ${n.telegram.lastError}` });
      reload();
    } catch (err) {
      setMessage({ tone: 'danger', text: err.message });
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Food"
        title={isVolunteer ? 'My pickups' : 'Collections'}
        subtitle="Every assignment and change also appears here, so nothing depends on Telegram."
        actions={isCoordinator && (
          <>
            <Button variant="secondary" icon="bell" onClick={reminders}>Send due reminders</Button>
            <Button icon="plus" onClick={() => setAssigning(true)}>Assign collector</Button>
          </>
        )}
      />
      <div className="mb-4 flex gap-1 rounded-xl border border-line bg-card p-1 sm:inline-flex" role="tablist">
        {['active', 'done'].map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold capitalize ${tab === t ? 'bg-primary text-white' : 'text-muted hover:text-ink'}`}>
            {t === 'active' ? 'Active' : 'Finished'}
          </button>
        ))}
      </div>
      {message && <div className="mb-4"><Alert tone={message.tone}>{message.text}</Alert></div>}
      {loading && !data && <LoadingState />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.tasks.length === 0 && <Card><EmptyState icon="truck" title={tab === 'active' ? 'No active pickups' : 'No finished pickups yet'} /></Card>}

      <div className="space-y-4">
        {data?.tasks.map((task) => {
          const r = task.reservation;
          const loc = task.listing.pickupLocation;
          const actions = (NEXT[task.status] || []).filter((s) => isCoordinator || !COORDINATOR_ONLY.includes(s));
          return (
            <Card key={task._id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{formatQty(r.quantityReserved)} {r.unit} {task.listing.foodType}</p>
                  <p className="flex items-center gap-1 text-sm text-muted"><Icon name="mapPin" size={14} />{loc.address || loc.district} · shared by {task.listing.postedBy?.name}{task.listing.postedBy?.phone && ` (${task.listing.postedBy.phone})`}</p>
                  <p className="mt-1 text-sm">
                    <Icon name="truck" size={14} className="mr-1 inline" />
                    <strong>{task.collector.name}</strong>{task.collector.phone && ` · ${task.collector.phone}`} · {task.collector.type === 'volunteer' ? 'volunteer' : 'arranged by the organization'}
                  </p>
                  <p className="text-sm">Pickup at <strong>{formatDateTime(task.scheduledAt)}</strong> · deadline {formatDateTime(task.listing.pickupDeadline)}</p>
                  {!isCoordinator && <p className="text-xs text-muted">For {task.organization.name}</p>}
                </div>
                <div className="text-right">
                  <StatusBadge status={task.status} />
                  {task.status === 'delayed' && <p className="mt-1 text-xs text-warning">+{task.delay.minutes} min: {task.delay.reason}</p>}
                  {task.quantityCollected > 0 && <p className="mt-1 text-xs">Collected {formatQty(task.quantityCollected)} {r.unit}</p>}
                </div>
              </div>

              {actions.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {actions.map((s) => (
                    <Button key={s} size="sm" variant={s === 'collected' ? 'primary' : ['cancelled', 'missed'].includes(s) ? 'ghost' : 'secondary'}
                      onClick={() => (s === 'en_route' ? quick(task, s) : setChanging({ task, status: s }))}>
                      {ACTION_LABEL[s]}
                    </Button>
                  ))}
                </div>
              )}

              {task.deliveries.length > 0 && (
                <div className="mt-4 rounded-xl bg-paper p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Icon name="send" size={13} /> Telegram deliveries</p>
                  <ul className="space-y-1.5 text-sm">
                    {task.deliveries.map((n) => (
                      <li key={n._id} className="flex flex-wrap items-center gap-2">
                        <Badge tone={DELIVERY_TONE[n.telegram.status]}>{n.telegram.status}</Badge>
                        <span className="min-w-0 flex-1 truncate">{n.title} → {n.user?.name}</span>
                        <span className="text-xs text-muted">{n.telegram.attempts} attempt(s){n.telegram.lastError && ` · ${n.telegram.lastError}`}</span>
                        {n.telegram.status === 'failed' && !isVolunteer && <Button size="sm" variant="secondary" icon="refresh" onClick={() => retry(n)}>Retry</Button>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {assigning && <AssignModal onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); setTab('active'); reload(); }} />}
      {changing && <StatusModal change={changing} onClose={() => setChanging(null)} onDone={() => { setChanging(null); reload(); }} />}
    </div>
  );
}

// Choose a reservation that still needs a collector, then a volunteer or an organization-arranged person.
function AssignModal({ onClose, onDone }) {
  const reservations = useFetch('/reservations');
  const volunteers = useFetch('/volunteers');
  const needing = (reservations.data?.reservations || []).filter((r) => r.status === 'reserved');
  const [form, setForm] = useState({ reservationId: '', collectorType: 'volunteer', volunteerId: '', collectorName: '', collectorPhone: '', scheduledAt: toLocalInput(new Date(Date.now() + 3600000)) });
  const [key] = useState(newIdempotencyKey); // a double-click sends the same key -> one task
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const update = (changes) => setForm({ ...form, ...changes });

  async function save() {
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      const { reservationId, scheduledAt, ...rest } = form;
      await collectionApi.assign(reservationId, { ...rest, volunteerId: rest.volunteerId || undefined, scheduledAt: fromLocalInput(scheduledAt) }, key);
      onDone();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Assign a collector" footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button loading={busy} disabled={!form.reservationId} onClick={save}>Assign</Button></>}>
      <div className="space-y-4">
        {reservations.loading ? <LoadingState /> : needing.length === 0 ? (
          <Alert tone="info">All your reservations already have a collector (or are finished).</Alert>
        ) : (
          <Select label="Reservation" value={form.reservationId} placeholder="Choose" options={needing.map((r) => ({ value: r._id, label: `${formatQty(r.quantityReserved)} ${r.unit} ${r.listing.foodType} (pickup by ${formatDateTime(r.listing.pickupDeadline)})` }))} onChange={(e) => update({ reservationId: e.target.value })} />
        )}
        <Select label="Who collects?" value={form.collectorType} options={[{ value: 'volunteer', label: 'A volunteer' }, { value: 'org_arranged', label: 'Someone our organization arranges' }]} onChange={(e) => update({ collectorType: e.target.value })} />
        {form.collectorType === 'volunteer' ? (
          <Select label="Volunteer" value={form.volunteerId} placeholder="Choose volunteer" options={(volunteers.data?.volunteers || []).map((v) => ({ value: v._id, label: `${v.name} · ${v.district}${v.telegramConnected ? ' · on Telegram' : ''}` }))} onChange={(e) => update({ volunteerId: e.target.value })} error={errors.volunteerId} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Collector name" value={form.collectorName} onChange={(e) => update({ collectorName: e.target.value })} error={errors.collectorName} />
            <Input label="Phone" value={form.collectorPhone} onChange={(e) => update({ collectorPhone: e.target.value })} />
          </div>
        )}
        <Input label="Pickup time" type="datetime-local" value={form.scheduledAt} onChange={(e) => update({ scheduledAt: e.target.value })} error={errors.scheduledAt} />
        {error && Object.keys(errors).length === 0 && <Alert tone="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}

function StatusModal({ change, onClose, onDone }) {
  const { task, status } = change;
  const reserved = task.reservation.quantityReserved;
  const [form, setForm] = useState({ quantityCollected: status === 'collected' ? String(reserved) : '', delayMinutes: '30', reason: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const needsQuantity = ['collected', 'partially_collected'].includes(status);

  async function save() {
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      await collectionApi.setStatus(task._id, {
        status,
        reason: form.reason,
        ...(needsQuantity && { quantityCollected: Number(form.quantityCollected) }),
        ...(status === 'delayed' && { delayMinutes: Number(form.delayMinutes) }),
      });
      onDone();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={ACTION_LABEL[status].replace('…', '')} footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button loading={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        {needsQuantity && <Input label={`Quantity collected (${task.reservation.unit}, reserved ${reserved})`} type="number" min="0" value={form.quantityCollected} onChange={(e) => setForm({ ...form, quantityCollected: e.target.value })} error={errors.quantityCollected} />}
        {status === 'partially_collected' && <p className="text-sm text-muted">The rest is recorded as a shortage (not there at pickup).</p>}
        {status === 'missed' && <p className="text-sm text-muted">The food goes back to the listing so another organization can take it.</p>}
        {status === 'delayed' && <Input label="Minutes late" type="number" min="1" value={form.delayMinutes} onChange={(e) => setForm({ ...form, delayMinutes: e.target.value })} error={errors.delayMinutes} />}
        <Textarea label={['cancelled', 'missed', 'delayed'].includes(status) ? 'Reason' : 'Note (optional)'} rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} error={errors.reason} />
        {error && Object.keys(errors).length === 0 && <Alert tone="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}
