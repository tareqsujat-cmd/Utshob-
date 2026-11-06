import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { fieldErrors } from '../../api/client.js';
import { surplusApi } from '../../api/m1c.surplus.api.js';
import { PageHeader, Alert } from '../../components/ui/Layout.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { formatDateTime, formatQty, toLocalInput, fromLocalInput } from '../../components/ui/format.js';
import { AllergenPicker } from './SurplusParts.jsx';

// M1-C: my organization's food requests and their reservations.
export function FoodRequestsPage() {
  const meta = useMeta();
  const { data, loading, error, reload } = useFetch('/food-requests/mine');
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(null); // { kind: 'reservation' | 'request', item }
  const [message, setMessage] = useState(null);

  return (
    <div>
      <PageHeader
        eyebrow="Food"
        title="Food requests"
        subtitle="Say what you need and how much you can receive and carry. Then find matching surplus."
        actions={<Button icon="plus" onClick={() => setCreating(true)}>New request</Button>}
      />
      {message && <div className="mb-4"><Alert tone={message.tone}>{message.text}</Alert></div>}
      {(loading || !meta) && <LoadingState />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.requests.length === 0 && (
        <Card><EmptyState icon="inbox" title="No requests yet" action={<Button icon="plus" onClick={() => setCreating(true)}>New request</Button>} /></Card>
      )}

      <div className="space-y-4">
        {data && meta && data.requests.map((r) => {
          const active = ['open', 'partially_matched'].includes(r.status);
          const pct = Math.min(100, (r.quantityMatched / r.quantityNeeded) * 100);
          return (
            <Card key={r._id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{r.title}</h2>
                  <p className="text-sm text-muted">
                    Need {formatQty(r.quantityNeeded)} {r.unit} · receive up to {r.receivingCapacity} · carry up to {r.collectionCapacity}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="mt-3 h-2 rounded-full bg-paper"><div className="h-2 rounded-full bg-success" style={{ width: `${pct}%` }} /></div>
              <p className="mt-1 text-xs text-muted">{formatQty(r.quantityMatched)} of {formatQty(r.quantityNeeded)} {r.unit} reserved</p>
              {r.avoidAllergens.length > 0 && <p className="mt-2 text-xs">Avoid: {r.avoidAllergens.map((a) => <Badge key={a} tone="danger" className="mr-1">{meta.allergenLabels[a]}</Badge>)}</p>}
              {r.availability.length > 0 && (
                <p className="mt-2 text-xs text-muted">Can collect: {r.availability.map((w) => `${formatDateTime(w.from)} – ${formatDateTime(w.to)}`).join(' · ')}</p>
              )}

              {r.reservations.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-line pt-4">
                  {r.reservations.map((res) => (
                    <li key={res._id} className="flex flex-wrap items-center gap-3 text-sm">
                      <Icon name="leaf" size={16} className="text-primary" />
                      <Link to={`/surplus/${res.listing._id}`} className="flex-1 font-medium hover:text-primary">
                        {formatQty(res.quantityReserved)} {res.unit} {res.listing.foodType}
                        <span className="font-normal text-muted"> · from {res.listing.postedBy?.name} · pickup by {formatDateTime(res.listing.pickupDeadline)}</span>
                      </Link>
                      <StatusBadge status={res.status} />
                      {res.status === 'reserved' && <Button size="sm" variant="ghost" onClick={() => setCancelling({ kind: 'reservation', item: res })}>Cancel</Button>}
                    </li>
                  ))}
                </ul>
              )}

              {active && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <ButtonLink to={`/food-requests/${r._id}/matches`} icon="sparkles">Find matches</ButtonLink>
                  <Button variant="ghost" onClick={() => setCancelling({ kind: 'request', item: r })}>Cancel request</Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {creating && <RequestModal meta={meta} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {cancelling && (
        <CancelModal
          target={cancelling}
          onClose={() => setCancelling(null)}
          onDone={(text) => { setCancelling(null); setMessage({ tone: 'success', text }); reload(); }}
          onError={(text) => { setCancelling(null); setMessage({ tone: 'warning', text }); }}
        />
      )}
    </div>
  );
}

function RequestModal({ meta, onClose, onSaved }) {
  const { user } = useAuth();
  const capacity = user.organization?.defaultReceivingCapacity || '';
  const [form, setForm] = useState({
    title: '', notes: '', unit: 'portion', quantityNeeded: '', receivingCapacity: capacity, collectionCapacity: capacity,
    availability: [{ from: toLocalInput(new Date()), to: toLocalInput(new Date(Date.now() + 6 * 3600000)) }],
    avoidAllergens: [],
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const update = (changes) => setForm({ ...form, ...changes });
  const setWindow = (i, changes) => update({ availability: form.availability.map((w, j) => (j === i ? { ...w, ...changes } : w)) });

  async function save() {
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      await surplusApi.createRequest({
        ...form,
        quantityNeeded: Number(form.quantityNeeded),
        receivingCapacity: Number(form.receivingCapacity),
        collectionCapacity: Number(form.collectionCapacity),
        availability: form.availability.map((w) => ({ from: fromLocalInput(w.from), to: fromLocalInput(w.to) })),
      });
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New food request" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button loading={busy} icon="check" onClick={save}>Save request</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Title" required className="sm:col-span-2" placeholder="e.g. Dinner for 80 children" value={form.title} onChange={(e) => update({ title: e.target.value })} error={errors.title} />
        <Input label="How much do you need?" type="number" min="0" required value={form.quantityNeeded} onChange={(e) => update({ quantityNeeded: e.target.value })} error={errors.quantityNeeded} />
        <Select label="Unit" value={form.unit} options={meta.foodUnits.map((u) => ({ value: u, label: u }))} onChange={(e) => update({ unit: e.target.value })} />
        <Input label="Receiving capacity" hint="Most you can accept and store at once" type="number" min="0" required value={form.receivingCapacity} onChange={(e) => update({ receivingCapacity: e.target.value })} error={errors.receivingCapacity} />
        <Input label="Collection capacity" hint="Most your collectors can carry in one trip" type="number" min="0" required value={form.collectionCapacity} onChange={(e) => update({ collectionCapacity: e.target.value })} error={errors.collectionCapacity} />
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium">When can you collect?</p>
          {form.availability.map((w, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <Input aria-label="From" type="datetime-local" value={w.from} onChange={(e) => setWindow(i, { from: e.target.value })} />
              <Input aria-label="To" type="datetime-local" value={w.to} onChange={(e) => setWindow(i, { to: e.target.value })} />
              <button type="button" className="mb-1 rounded-lg p-2 text-muted hover:text-danger" aria-label="Remove window" onClick={() => update({ availability: form.availability.filter((_, j) => j !== i) })}><Icon name="x" size={16} /></button>
            </div>
          ))}
          <Button size="sm" variant="secondary" icon="plus" onClick={() => update({ availability: [...form.availability, { from: '', to: '' }] })}>Add time window</Button>
          {errors['availability.0'] && <p className="mt-1 text-xs text-danger">{errors['availability.0']}</p>}
        </div>
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium">Allergens to avoid</p>
          <AllergenPicker meta={meta} selected={form.avoidAllergens} onChange={(avoidAllergens) => update({ avoidAllergens })} />
        </div>
        <Textarea label="Notes" className="sm:col-span-2" rows={2} value={form.notes} onChange={(e) => update({ notes: e.target.value })} />
      </div>
      {error && <div className="mt-4"><Alert tone="danger">{error}</Alert></div>}
    </Modal>
  );
}

function CancelModal({ target, onClose, onDone, onError }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const isReservation = target.kind === 'reservation';

  async function confirm() {
    setBusy(true);
    try {
      if (isReservation) {
        await surplusApi.cancelReservation(target.item._id, reason);
        onDone(`Reservation cancelled. ${target.item.quantityReserved} ${target.item.unit} went back to the listing.`);
      } else {
        await surplusApi.cancelRequest(target.item._id, reason);
        onDone('Request cancelled.');
      }
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <Modal open onClose={onClose} title={isReservation ? 'Cancel reservation?' : 'Cancel request?'} footer={<><Button variant="secondary" onClick={onClose}>Keep</Button><Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={confirm}>Cancel it</Button></>}>
      {isReservation && <p className="mb-3 text-sm">The food goes back to the listing so another organization can take it.</p>}
      <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}
