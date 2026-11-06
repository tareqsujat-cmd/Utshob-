import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch.js';
import { fieldErrors } from '../../api/client.js';
import { moneyApi } from '../../api/m2a.money.api.js';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Alert, StatTile } from '../../components/ui/Layout.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { formatTaka, formatDateTime } from '../../components/ui/format.js';

const TYPE_LABEL = { cash: 'Cash', in_kind: 'Goods (in kind)', sponsorship: 'Sponsorship' };
const RECEIPT_LABEL = { manual_cash: 'cash in hand', sandbox: 'paid online', in_kind: 'goods received' };

// M2-A: cash, goods and sponsorships. Promised (pledged) and received are always shown apart.
export function EventContributionsTab() {
  const { event, permissions } = useOutletContext();
  const { data, loading, error, reload } = useFetch(`/events/${event._id}/contributions`);
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState(null); // { kind: 'receive' | 'pay' | 'fulfil' | 'cancel', contribution }
  const canEdit = permissions.isOrganizer;
  const groupNames = (event.costSplit?.groups || []).map((g) => g.name);

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { totals, contributions, paymentsEnabled } = data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Pledged (promised)" value={formatTaka(totals.pledged)} icon="heart" />
        <StatTile label="Received" value={formatTaka(totals.received)} icon="check" tone="success" />
        <StatTile label="Still to come" value={formatTaka(totals.outstanding)} icon="clock" tone="warning" />
        <StatTile label="Goods (estimated value)" value={formatTaka(totals.inKindEstimatedValue)} icon="gift" tone="accent" />
      </div>

      <Card>
        <CardHeader
          title="Contributions"
          subtitle="Record promises first; mark money or goods received when they actually arrive."
          action={canEdit && <Button icon="plus" onClick={() => setAdding(true)}>Add contribution</Button>}
        />
        {!paymentsEnabled && canEdit && (
          <div className="mb-4"><Alert tone="info">Online payment is not configured on this server; record cash received manually.</Alert></div>
        )}
        {contributions.length === 0 && <EmptyState icon="gift" title="No contributions yet" />}
        <ul className="space-y-3">
          {contributions.map((c) => {
            const isGoods = c.type === 'in_kind';
            const pledged = isGoods ? c.inKind.quantity : c.amountPledged;
            const received = isGoods ? c.inKind.receivedQuantity : c.amountReceived;
            const show = (n) => (isGoods ? `${n} ${c.inKind.unit}` : formatTaka(n));
            const open = !['received', 'cancelled'].includes(c.status);
            return (
              <li key={c._id} className={`rounded-xl border border-line p-4 ${c.status === 'cancelled' ? 'opacity-50' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{c.contributorName} <Badge className="ml-1">{TYPE_LABEL[c.type]}</Badge></p>
                    <p className="text-sm text-muted">
                      {isGoods && `${c.inKind.description} (≈ ${formatTaka(c.inKind.estimatedValue)}) · `}
                      {c.type === 'sponsorship' && `${c.sponsorship.sponsorName}: ${c.sponsorship.offer} · in return: ${c.sponsorship.benefitsPromised} · `}
                      {c.group || 'No group'}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="mt-3 h-2 rounded-full bg-paper">
                  <div className="h-2 rounded-full bg-success" style={{ width: `${pledged ? Math.min(100, (received / pledged) * 100) : 0}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">Received <strong className="text-ink">{show(received)}</strong> of {show(pledged)} pledged</p>
                {c.receipts.length > 0 && (
                  <ul className="mt-2 text-xs text-muted">
                    {c.receipts.map((r, i) => <li key={i}>• {r.amount ? formatTaka(r.amount) : `${r.quantity} ${c.inKind.unit}`}, {RECEIPT_LABEL[r.method]}, {formatDateTime(r.at)}{r.note && ` (${r.note})`}</li>)}
                  </ul>
                )}
                {c.type === 'sponsorship' && <p className="mt-2 text-xs">Fulfilment: <Badge tone={c.sponsorship.fulfilmentStatus === 'fulfilled' ? 'success' : 'neutral'}>{c.sponsorship.fulfilmentStatus.replace('_', ' ')}</Badge></p>}
                {canEdit && c.status !== 'cancelled' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {open && <Button size="sm" variant="secondary" onClick={() => setAction({ kind: 'receive', contribution: c })}>Record received</Button>}
                    {open && !isGoods && (
                      <Button size="sm" variant="secondary" icon="card" disabled={!paymentsEnabled} title={paymentsEnabled ? '' : 'Online payment is not configured'} onClick={() => setAction({ kind: 'pay', contribution: c })}>Pay online</Button>
                    )}
                    {c.type === 'sponsorship' && <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'fulfil', contribution: c })}>Fulfilment</Button>}
                    {c.status === 'pledged' && <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'cancel', contribution: c })}>Cancel pledge</Button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {adding && <AddContributionModal event={event} groupNames={groupNames} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {action && <ActionModal action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); reload(); }} />}
    </div>
  );
}

function AddContributionModal({ event, groupNames, onClose, onSaved }) {
  const [type, setType] = useState('cash');
  const [form, setForm] = useState({ contributorName: '', contributorPhone: '', group: '', amountPledged: '', description: '', quantity: '', unit: 'kg', estimatedValue: '', sponsorName: '', offer: '', benefitsPromised: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const update = (changes) => setForm({ ...form, ...changes });

  async function save() {
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      await moneyApi.addContribution(event._id, {
        type,
        contributorName: form.contributorName,
        contributorPhone: form.contributorPhone,
        group: form.group,
        amountPledged: Number(form.amountPledged) || 0,
        ...(type === 'in_kind' && { inKind: { description: form.description, quantity: Number(form.quantity), unit: form.unit, estimatedValue: Number(form.estimatedValue) || 0 } }),
        ...(type === 'sponsorship' && { sponsorship: { sponsorName: form.sponsorName, offer: form.offer, benefitsPromised: form.benefitsPromised } }),
      });
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add contribution" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button loading={busy} icon="check" onClick={save}>Save pledge</Button></>}>
      <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Type">
        {Object.entries(TYPE_LABEL).map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={type === value} onClick={() => setType(value)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${type === value ? 'border-primary bg-primary text-white' : 'border-line hover:border-primary'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" required value={form.contributorName} onChange={(e) => update({ contributorName: e.target.value })} error={errors.contributorName} />
        <Input label="Phone" value={form.contributorPhone} onChange={(e) => update({ contributorPhone: e.target.value })} />
        <Select label="Counts for group" value={form.group} placeholder="No group" options={groupNames.map((g) => ({ value: g, label: g }))} onChange={(e) => update({ group: e.target.value })} />
        {type !== 'in_kind' && <Input label="Pledged amount (৳)" type="number" min="1" required value={form.amountPledged} onChange={(e) => update({ amountPledged: e.target.value })} error={errors.amountPledged} />}
        {type === 'in_kind' && (
          <>
            <Input label="What goods?" required className="sm:col-span-2" placeholder="e.g. Basmati rice" value={form.description} onChange={(e) => update({ description: e.target.value })} error={errors['inKind.description']} />
            <div className="grid grid-cols-[1fr_110px] gap-2">
              <Input label="Quantity" type="number" min="0" required value={form.quantity} onChange={(e) => update({ quantity: e.target.value })} />
              <Select label="Unit" value={form.unit} options={['kg', 'litre', 'piece', 'portion', 'item'].map((u) => ({ value: u, label: u }))} onChange={(e) => update({ unit: e.target.value })} />
            </div>
            <Input label="Estimated value (৳)" type="number" min="0" value={form.estimatedValue} onChange={(e) => update({ estimatedValue: e.target.value })} hint="An estimate, shown separately from cash" />
          </>
        )}
        {type === 'sponsorship' && (
          <>
            <Input label="Sponsor (company or person)" required value={form.sponsorName} onChange={(e) => update({ sponsorName: e.target.value })} error={errors['sponsorship.sponsorName']} />
            <Input label="What they offer" value={form.offer} onChange={(e) => update({ offer: e.target.value })} />
            <Input label="What they get in return" className="sm:col-span-2" placeholder="e.g. Logo on the stage banner" value={form.benefitsPromised} onChange={(e) => update({ benefitsPromised: e.target.value })} />
          </>
        )}
      </div>
      {error && Object.keys(errors).length === 0 && (
        <div className="mt-4"><Alert tone={error.status === 402 ? 'warning' : 'danger'} title={error.status === 402 ? 'Plan feature' : undefined}>{error.message}</Alert></div>
      )}
    </Modal>
  );
}

// One small dialog for the four actions on a contribution.
function ActionModal({ action, onClose, onDone }) {
  const c = action.contribution;
  const isGoods = c.type === 'in_kind';
  const left = isGoods ? c.inKind.quantity - c.inKind.receivedQuantity : c.amountPledged - c.amountReceived;
  const [value, setValue] = useState(String(left));
  const [note, setNote] = useState('');
  const [status, setStatus] = useState(c.sponsorship?.fulfilmentStatus || 'not_started');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      if (action.kind === 'receive') await moneyApi.receive(c._id, isGoods ? { quantity: Number(value), note } : { amount: Number(value), note });
      if (action.kind === 'cancel') await moneyApi.cancelContribution(c._id, note);
      if (action.kind === 'fulfil') await moneyApi.setFulfilment(c._id, { fulfilmentStatus: status, fulfilmentNotes: note });
      if (action.kind === 'pay') {
        const { gatewayUrl } = await moneyApi.checkout(c._id, Number(value));
        window.location.href = gatewayUrl; // go to the SSLCOMMERZ sandbox page; it sends us back afterwards
        return;
      }
      onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const titles = { receive: 'Record what was received', pay: 'Pay online (sandbox)', fulfil: 'Sponsorship fulfilment', cancel: 'Cancel pledge' };
  return (
    <Modal open onClose={onClose} title={`${titles[action.kind]}: ${c.contributorName}`} footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button loading={busy} variant={action.kind === 'cancel' ? 'danger' : 'primary'} onClick={confirm}>{action.kind === 'pay' ? 'Continue to payment' : 'Save'}</Button></>}>
      <div className="space-y-4">
        {(action.kind === 'receive' || action.kind === 'pay') && (
          <Input label={isGoods ? `Quantity received (${c.inKind.unit})` : 'Amount (৳)'} type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} hint={`Still pledged: ${isGoods ? `${left} ${c.inKind.unit}` : formatTaka(left)}`} />
        )}
        {action.kind === 'pay' && <p className="text-sm text-muted">You will be sent to the SSLCOMMERZ sandbox (test money only). Our server checks the payment with the gateway before counting it.</p>}
        {action.kind === 'fulfil' && (
          <Select label="Status" value={status} options={[{ value: 'not_started', label: 'Not started' }, { value: 'in_progress', label: 'In progress' }, { value: 'fulfilled', label: 'Fulfilled' }]} onChange={(e) => setStatus(e.target.value)} />
        )}
        {action.kind !== 'pay' && <Textarea label={action.kind === 'cancel' ? 'Reason' : 'Note'} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
        {error && <Alert tone={error.status === 402 || error.status === 409 ? 'warning' : 'danger'}>{error.message}</Alert>}
      </div>
    </Modal>
  );
}
