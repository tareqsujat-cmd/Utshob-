import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { fieldErrors } from '../../api/client.js';
import { eventsApi } from '../../api/m1a.events.api.js';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Alert } from '../../components/ui/Layout.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { formatQty } from '../../components/ui/format.js';

const NEXT_ACTION_LABEL = { started: 'Start cooking', completed: 'Mark cooked', cancelled: 'Cancel' };

// M1-A: menu, cooking batches, and adjusting planned batches when attendance changes.
export function EventFoodTab() {
  const { event, permissions } = useOutletContext();
  const meta = useMeta();
  const [attendance, setAttendance] = useState(null); // null = use the expected guest count
  const { data, loading, error, reload } = useFetch(`/events/${event._id}/food-plan${attendance !== null ? `?attendance=${attendance}` : ''}`);

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data || !meta) return <LoadingState />;

  const canEdit = permissions.canEdit;
  return (
    <div className="space-y-6">
      <AttendancePicker data={data} onPick={setAttendance} />
      {data.menu.length === 0 ? (
        <Card><EmptyState icon="utensils" title="No menu yet" message="Add dishes below to calculate quantities." /></Card>
      ) : (
        <PlanTable data={data} />
      )}
      {canEdit && data.menu.length > 0 && <AdjustPanel event={event} attendance={data.attendance} onApplied={reload} />}
      <Batches event={event} data={data} meta={meta} canEdit={canEdit} onChanged={reload} />
      <MenuEditor key={JSON.stringify(data.menu)} event={event} menu={data.menu} meta={meta} canEdit={canEdit} onSaved={reload} />
    </div>
  );
}

// Which number of guests to plan for: expected, confirmed RSVPs, or a custom number.
function AttendancePicker({ data, onPick }) {
  const [custom, setCustom] = useState('');
  const options = [
    { label: `Expected guests (${data.guestCount})`, value: data.guestCount },
    { label: `Confirmed RSVPs (${data.confirmedAttendance})`, value: data.confirmedAttendance },
  ];
  return (
    <Card>
      <CardHeader title={`Planning for ${data.attendance} guests`} subtitle="Choose the attendance to calculate food for." />
      <div className="flex flex-wrap items-end gap-2">
        {options.map((o) => (
          <Button key={o.label} size="sm" variant={data.attendance === o.value ? 'primary' : 'secondary'} onClick={() => onPick(o.value)}>{o.label}</Button>
        ))}
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (custom) onPick(Number(custom)); }}>
          <Input aria-label="Custom attendance" type="number" min="0" placeholder="Other number" className="w-36" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <Button size="sm" variant="secondary" type="submit">Use</Button>
        </form>
      </div>
    </Card>
  );
}

function PlanTable({ data }) {
  return (
    <Card padded={false}>
      <div className="px-5 pt-5 md:px-6"><CardHeader title="What to cook" subtitle="Cooked and cooking quantities are locked; only planned batches can change." /></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-2 md:px-6">Dish</th>
              <th className="px-3 py-2 text-right">Needed</th>
              <th className="px-3 py-2 text-right">Cooked</th>
              <th className="px-3 py-2 text-right">Cooking</th>
              <th className="px-3 py-2 text-right">Planned</th>
              <th className="px-5 py-2 text-right md:px-6">Difference</th>
            </tr>
          </thead>
          <tbody>
            {data.plan.map((row) => (
              <tr key={row.menuItemId} className="border-b border-line/60 last:border-0">
                <td className="px-5 py-3 md:px-6">
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted">{row.quantityPerGuest} {row.unit} per guest</p>
                </td>
                <td className="px-3 py-3 text-right">
                  {formatQty(row.required)} {row.unit}
                  {row.estimatedPortions !== null && <span className="block text-xs text-muted">≈ {row.estimatedPortions} portions (estimated)</span>}
                </td>
                <td className="px-3 py-3 text-right">{formatQty(row.completed)}</td>
                <td className="px-3 py-3 text-right">{formatQty(row.started)}</td>
                <td className="px-3 py-3 text-right">{formatQty(row.planned)}</td>
                <td className="px-5 py-3 text-right md:px-6">
                  {row.difference === 0 ? <Badge tone="success">On target</Badge> : (
                    <Badge tone={row.difference > 0 ? 'warning' : 'accent'}>{row.difference > 0 ? '+' : ''}{formatQty(row.difference)} {row.unit}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// "Suggest" asks the server for changes (nothing saved); "Apply" saves only what the host approves.
function AdjustPanel({ event, attendance, onApplied }) {
  const [suggestion, setSuggestion] = useState(null);
  const [result, setResult] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function suggest() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setSuggestion(await eventsApi.suggestFoodPlan(event._id, attendance));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const res = await eventsApi.applyFoodPlan(event._id, { attendance, adjustments: suggestion.adjustments, reason });
      setResult(res);
      setSuggestion(null);
      onApplied();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const describe = (a) =>
    a.type === 'add' ? `Add a new batch of ${formatQty(a.quantity)} ${a.unit}`
      : a.type === 'cancel' ? `Cancel a planned batch of ${formatQty(a.from)} ${a.unit}`
        : `Change a planned batch from ${formatQty(a.from)} to ${formatQty(a.to)} ${a.unit}`;

  return (
    <Card>
      <CardHeader
        title="Adjust for attendance"
        subtitle={`Suggest changes to planned batches so the food matches ${attendance} guests.`}
        action={<Button icon="sparkles" loading={busy && !suggestion} onClick={suggest}>Suggest adjustments</Button>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {result && (
        <Alert tone={result.skipped.length ? 'warning' : 'success'} title={`${result.applied.length} change(s) applied`}>
          {result.skipped.length > 0 && `${result.skipped.length} skipped: those batches had already started or changed, so they were left untouched.`}
        </Alert>
      )}
      {suggestion && (
        <div className="space-y-4">
          {suggestion.adjustments.length === 0 && <p className="text-sm text-muted">Planned batches already match. Nothing to change.</p>}
          <ul className="space-y-2">
            {suggestion.adjustments.map((a, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-line px-4 py-3 text-sm">
                <Icon name={a.type === 'add' ? 'plus' : a.type === 'cancel' ? 'ban' : 'edit'} size={18} className="mt-0.5 text-primary" />
                <span><strong>{a.menuItemName}</strong>: {describe(a)}</span>
              </li>
            ))}
          </ul>
          {suggestion.notes.map((note) => <Alert key={note} tone="info">{note}</Alert>)}
          {suggestion.adjustments.length > 0 && (
            <>
              <Textarea label="Note for the history (optional)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex gap-2">
                <Button icon="check" loading={busy} onClick={apply}>Approve & apply</Button>
                <Button variant="secondary" onClick={() => setSuggestion(null)}>Reject</Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Batches({ event, data, meta, canEdit, onChanged }) {
  const [form, setForm] = useState({ menuItemId: '', quantity: '', note: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const unit = data.menu.find((m) => m._id === form.menuItemId)?.unit;

  async function add(e) {
    e.preventDefault();
    setError(null);
    setErrors({});
    try {
      await eventsApi.addBatch(event._id, { ...form, quantity: Number(form.quantity) });
      setForm({ menuItemId: '', quantity: '', note: '' });
      onChanged();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.message);
    }
  }

  async function setStatus(batch, status) {
    setError(null);
    try {
      await eventsApi.setBatchStatus(batch._id, status);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Card>
      <CardHeader title="Cooking batches" subtitle="planned → cooking → cooked. Cancelled batches stay in the list as history." />
      {error && <div className="mb-4"><Alert tone="danger">{error}</Alert></div>}
      {data.batches.length === 0 && <p className="mb-4 text-sm text-muted">No batches yet.</p>}
      <ul className="divide-y divide-line">
        {data.batches.map((b) => (
          <li key={b._id} className={`flex flex-wrap items-center gap-3 py-3 ${b.status === 'cancelled' ? 'opacity-50' : ''}`}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{formatQty(b.quantity)} {b.unit} · {b.menuItemName}</p>
              {b.note && <p className="text-xs text-muted">{b.note}</p>}
            </div>
            <StatusBadge status={b.status} />
            {canEdit && meta.batchTransitions[b.status].map((next) => (
              <Button key={next} size="sm" variant={next === 'cancelled' ? 'ghost' : 'secondary'} onClick={() => setStatus(b, next)}>{NEXT_ACTION_LABEL[next]}</Button>
            ))}
          </li>
        ))}
      </ul>
      {canEdit && data.menu.length > 0 && (
        <form onSubmit={add} className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-[1.4fr_1fr_1.4fr_auto] sm:items-end">
          <Select label="Dish" required value={form.menuItemId} placeholder="Choose dish" options={data.menu.map((m) => ({ value: m._id, label: m.name }))} onChange={(e) => setForm({ ...form, menuItemId: e.target.value })} error={errors.menuItemId} />
          <Input label={`Quantity${unit ? ` (${unit})` : ''}`} type="number" step="0.1" min="0" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} error={errors.quantity} />
          <Input label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <Button type="submit" icon="plus">Add batch</Button>
        </form>
      )}
    </Card>
  );
}

// Dishes and how much each guest eats. Units can't change once a dish has batches (server rule).
function MenuEditor({ event, menu, meta, canEdit, onSaved }) {
  const [rows, setRows] = useState(menu.map((m) => ({ ...m })));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const setRow = (index, changes) => setRows(rows.map((r, i) => (i === index ? { ...r, ...changes } : r)));

  async function save() {
    setBusy(true);
    setMessage(null);
    setErrors({});
    try {
      await eventsApi.saveMenu(event._id, {
        menu: rows.map(({ _id, name, course, unit, quantityPerGuest, portionsPerUnit }) => ({
          _id, name, course, unit, quantityPerGuest: Number(quantityPerGuest), portionsPerUnit: unit === 'portion' ? 1 : Number(portionsPerUnit),
        })),
        reason,
      });
      setMessage({ tone: 'success', text: 'Menu saved.' });
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage({ tone: 'danger', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Menu" subtitle="Portion numbers for kg, litre or piece are estimates and are labelled that way." />
      <div className="space-y-4">
        {rows.map((row, index) => (
          <div key={row._id || index} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-6 sm:items-end">
            <Input label="Dish" className="sm:col-span-2" disabled={!canEdit} value={row.name} onChange={(e) => setRow(index, { name: e.target.value })} error={errors[`menu.${index}.name`]} />
            <Select label="Course" disabled={!canEdit} value={row.course} options={meta.menuCourses.map((c) => ({ value: c, label: c }))} onChange={(e) => setRow(index, { course: e.target.value })} />
            <Select label="Unit" disabled={!canEdit} value={row.unit} options={meta.foodUnits.map((u) => ({ value: u, label: u }))} onChange={(e) => setRow(index, { unit: e.target.value })} />
            <Input label={`Per guest (${row.unit})`} type="number" step="0.01" min="0" disabled={!canEdit} value={row.quantityPerGuest} onChange={(e) => setRow(index, { quantityPerGuest: e.target.value })} error={errors[`menu.${index}.quantityPerGuest`]} />
            {row.unit !== 'portion' ? (
              <Input label={`Portions per ${row.unit} (est.)`} type="number" step="0.1" min="0" disabled={!canEdit} value={row.portionsPerUnit} onChange={(e) => setRow(index, { portionsPerUnit: e.target.value })} />
            ) : <span />}
            {canEdit && (
              <button type="button" className="text-left text-xs font-semibold text-danger hover:underline sm:col-span-6" onClick={() => setRows(rows.filter((_, i) => i !== index))}>Remove dish</button>
            )}
          </div>
        ))}
        {canEdit && (
          <>
            <Button variant="secondary" size="sm" icon="plus" onClick={() => setRows([...rows, { name: '', course: 'main', unit: 'portion', quantityPerGuest: 1, portionsPerUnit: 1 }])}>Add dish</Button>
            {menu.length > 0 && <Textarea label="Why is the menu changing?" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />}
            {message && <Alert tone={message.tone}>{message.text}</Alert>}
            <Button loading={busy} icon="check" onClick={save}>Save menu</Button>
          </>
        )}
      </div>
    </Card>
  );
}
