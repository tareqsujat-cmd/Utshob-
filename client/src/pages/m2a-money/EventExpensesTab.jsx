import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { fieldErrors } from '../../api/client.js';
import { moneyApi } from '../../api/m2a.money.api.js';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Alert, StatTile } from '../../components/ui/Layout.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { LoadingState, ErrorState } from '../../components/ui/States.jsx';
import { formatDate, formatTaka } from '../../components/ui/format.js';

// M2-A: what the event really cost, and how the cost is shared between groups.
export function EventExpensesTab() {
  const { event, permissions } = useOutletContext();
  const meta = useMeta();
  const expenses = useFetch(`/events/${event._id}/expenses`);
  const split = useFetch(`/events/${event._id}/split-summary`);
  const reloadAll = () => {
    expenses.reload();
    split.reload();
  };
  const canEdit = permissions.isOrganizer; // organizers record money in any status (costs also come after the event)

  if (!expenses.data || !split.data || !meta) {
    if (expenses.error || split.error) return <ErrorState error={expenses.error || split.error} onRetry={reloadAll} />;
    return <LoadingState />;
  }
  const groupNames = split.data.groups.map((g) => g.name);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Spent so far" value={formatTaka(expenses.data.total)} icon="wallet" tone="accent" />
        {meta.budgetCategories.filter((c) => expenses.data.byCategory[c]).slice(0, 3).map((c) => (
          <StatTile key={c} label={meta.budgetCategoryLabels[c]} value={formatTaka(expenses.data.byCategory[c])} icon="chart" />
        ))}
      </div>

      <SplitCard event={event} summary={split.data} canEdit={canEdit} onSaved={reloadAll} />
      {canEdit && <ExpenseForm event={event} meta={meta} groupNames={groupNames} onAdded={reloadAll} />}
      <ExpenseList data={expenses.data} meta={meta} canEdit={canEdit} onChanged={reloadAll} />
    </div>
  );
}

function SplitCard({ event, summary, canEdit, onSaved }) {
  const { plan } = useAuth();
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState(summary.method);
  const [groups, setGroups] = useState(event.costSplit?.groups?.length ? event.costSplit.groups.map((g) => ({ ...g })) : [{ name: '' }, { name: '' }]);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const setGroup = (i, changes) => setGroups(groups.map((g, j) => (j === i ? { ...g, ...changes } : g)));

  async function save() {
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      await moneyApi.saveSplit(event._id, {
        method,
        groups: groups.map((g) => ({
          name: g.name,
          ...(method === 'percentage' && { percentage: Number(g.percentage) || 0 }),
          ...(method === 'custom' && { fixedAmount: Number(g.fixedAmount) || 0 }),
        })),
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage({ tone: err.status === 402 ? 'warning' : 'danger', title: err.status === 402 ? 'Plan feature' : undefined, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const methodLabel = { equal: 'Equal shares', percentage: 'By percentage', custom: 'Custom amounts' };
  return (
    <Card>
      <CardHeader
        title="Who pays what"
        subtitle={`${methodLabel[summary.method]} of ${formatTaka(summary.total)} recorded expenses. Only money actually received counts as paid.`}
        action={canEdit && !editing && <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(true)}>Change split</Button>}
      />
      {summary.warnings.map((w) => <div key={w} className="mb-3"><Alert tone="warning">{w}</Alert></div>)}

      {editing ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Split method">
            {Object.entries(methodLabel).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={method === value}
                onClick={() => setMethod(value)}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${method === value ? 'border-primary bg-primary text-white' : 'border-line hover:border-primary'}`}
              >
                {label}{value !== 'equal' && !plan?.features?.customSplits && ' · Plus'}
              </button>
            ))}
          </div>
          {groups.map((g, i) => (
            <div key={i} className="flex items-end gap-2">
              <Input label={i === 0 ? 'Group' : undefined} aria-label="Group name" className="flex-1" placeholder="e.g. Bride's family" value={g.name} onChange={(e) => setGroup(i, { name: e.target.value })} />
              {method === 'percentage' && <Input label={i === 0 ? '%' : undefined} aria-label="Percentage" type="number" min="0" max="100" className="w-24" value={g.percentage ?? ''} onChange={(e) => setGroup(i, { percentage: e.target.value })} />}
              {method === 'custom' && <Input label={i === 0 ? 'Amount (৳)' : undefined} aria-label="Amount" type="number" min="0" className="w-36" value={g.fixedAmount ?? ''} onChange={(e) => setGroup(i, { fixedAmount: e.target.value })} />}
              <button type="button" className="mb-1 rounded-lg p-2 text-muted hover:text-danger" aria-label="Remove group" onClick={() => setGroups(groups.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
            </div>
          ))}
          {errors.groups && <p className="text-xs font-medium text-danger">{errors.groups}</p>}
          <Button size="sm" variant="secondary" icon="plus" onClick={() => setGroups([...groups, { name: '' }])}>Add group</Button>
          {message && <Alert tone={message.tone} title={message.title}>{message.text}</Alert>}
          <div className="flex gap-2">
            <Button loading={busy} icon="check" onClick={save}>Save split</Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="-mx-5 overflow-x-auto md:-mx-6">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-2 md:px-6">Group</th>
                <th className="px-3 py-2 text-right">Share</th>
                <th className="px-3 py-2 text-right">Paid to vendors</th>
                <th className="px-3 py-2 text-right">Contributed</th>
                <th className="px-5 py-2 text-right md:px-6">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {summary.groups.map((g) => (
                <tr key={g.name} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-3 font-medium md:px-6">{g.name}{g.percentage !== undefined && summary.method === 'percentage' && <span className="text-muted"> ({g.percentage}%)</span>}</td>
                  <td className="px-3 py-3 text-right">{formatTaka(g.share)}</td>
                  <td className="px-3 py-3 text-right">{formatTaka(g.paidDirectly)}</td>
                  <td className="px-3 py-3 text-right">{formatTaka(g.contributed)}</td>
                  <td className="px-5 py-3 text-right md:px-6">
                    {g.outstanding > 0 ? <Badge tone="warning">owes {formatTaka(g.outstanding)}</Badge>
                      : g.outstanding < 0 ? <Badge tone="success">paid {formatTaka(-g.outstanding)} extra</Badge>
                        : <Badge tone="success">settled</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ExpenseForm({ event, meta, groupNames, onAdded }) {
  const empty = { category: '', description: '', amount: '', date: new Date().toISOString().slice(0, 10), paidByName: '', paidByGroup: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const update = (changes) => setForm({ ...form, ...changes });

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      await moneyApi.addExpense(event._id, { ...form, amount: Number(form.amount) });
      setForm(empty);
      onAdded();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Record an expense" />
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Select label="Category" required value={form.category} placeholder="Choose" options={meta.budgetCategories.map((c) => ({ value: c, label: meta.budgetCategoryLabels[c] }))} onChange={(e) => update({ category: e.target.value })} error={errors.category} />
        <Input label="Description" required value={form.description} onChange={(e) => update({ description: e.target.value })} error={errors.description} />
        <Input label="Amount (৳)" type="number" min="1" required value={form.amount} onChange={(e) => update({ amount: e.target.value })} error={errors.amount} />
        <Input label="Date" type="date" required value={form.date} onChange={(e) => update({ date: e.target.value })} />
        <Input label="Paid by (person)" value={form.paidByName} onChange={(e) => update({ paidByName: e.target.value })} />
        <Select label="Paid by (group)" value={form.paidByGroup} placeholder="Not from a group" options={groupNames.map((g) => ({ value: g, label: g }))} onChange={(e) => update({ paidByGroup: e.target.value })} />
        {error && <div className="sm:col-span-2 lg:col-span-3"><Alert tone="danger">{error}</Alert></div>}
        <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" icon="plus" loading={busy}>Add expense</Button></div>
      </form>
    </Card>
  );
}

function ExpenseList({ data, meta, canEdit, onChanged }) {
  const [voiding, setVoiding] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);

  async function confirmVoid() {
    try {
      await moneyApi.voidExpense(voiding._id, reason);
      setVoiding(null);
      setReason('');
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Card padded={false}>
      <div className="px-5 pt-5 md:px-6"><CardHeader title="All expenses" subtitle="Mistakes are voided with a reason, never deleted." /></div>
      {data.expenses.length === 0 && <p className="px-6 pb-6 text-sm text-muted">No expenses recorded yet.</p>}
      <ul className="divide-y divide-line">
        {data.expenses.map((e) => (
          <li key={e._id} className={`flex flex-wrap items-center gap-3 px-5 py-3 md:px-6 ${e.status === 'void' ? 'opacity-50' : ''}`}>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${e.status === 'void' ? 'line-through' : ''}`}>{e.description}</p>
              <p className="text-xs text-muted">
                {meta.budgetCategoryLabels[e.category]} · {formatDate(e.date)}{e.paidByName && ` · paid by ${e.paidByName}`}{e.paidByGroup && ` (${e.paidByGroup})`}
                {e.status === 'void' && ` · void: ${e.voidReason}`}
              </p>
            </div>
            <span className="font-semibold">{formatTaka(e.amount)}</span>
            {canEdit && e.status === 'recorded' && <Button size="sm" variant="ghost" onClick={() => setVoiding(e)}>Void</Button>}
          </li>
        ))}
      </ul>
      <Modal
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        title={`Void "${voiding?.description}"?`}
        footer={<><Button variant="secondary" onClick={() => setVoiding(null)}>Keep</Button><Button variant="danger" disabled={reason.trim().length < 3} onClick={confirmVoid}>Void expense</Button></>}
      >
        <p className="mb-3 text-sm">It stays in the list (crossed out) but no longer counts in totals.</p>
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
      </Modal>
    </Card>
  );
}
