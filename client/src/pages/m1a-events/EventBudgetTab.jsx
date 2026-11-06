import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { fieldErrors } from '../../api/client.js';
import { eventsApi } from '../../api/m1a.events.api.js';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { StatTile, Alert } from '../../components/ui/Layout.jsx';
import { Input, Textarea } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { LoadingState, ErrorState } from '../../components/ui/States.jsx';
import { formatTaka, formatDateTime } from '../../components/ui/format.js';

const ALERT_TONE = { danger: 'danger', warning: 'warning', info: 'info' };

// M1-A: budget breakdown, alerts, versioned scenarios.
export function EventBudgetTab() {
  const { event, permissions } = useOutletContext();
  const meta = useMeta();
  const summary = useFetch(`/events/${event._id}/budget-summary`);
  const scenarios = useFetch(`/events/${event._id}/budgets`);
  const reloadAll = () => {
    summary.reload();
    scenarios.reload();
  };

  if (summary.loading || scenarios.loading || !meta) return <LoadingState />;
  if (summary.error || scenarios.error) return <ErrorState error={summary.error || scenarios.error} onRetry={reloadAll} />;

  const s = summary.data;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total budget" value={formatTaka(s.budgetTotal)} icon="wallet" />
        <StatTile label={`Estimated (${s.scenarioName})`} value={formatTaka(s.totals.estimated)} icon="chart" tone="accent" />
        <StatTile label="Approved quotes" value={formatTaka(s.totals.quoted)} icon="file" tone="success" />
        <StatTile label="Remaining" value={formatTaka(s.remaining)} icon="sparkles" tone={s.remaining < 0 ? 'danger' : 'primary'} hint={s.remaining < 0 ? 'Over budget' : 'After expected costs'} />
      </div>

      {s.alerts.length > 0 && (
        <div className="space-y-2">
          {s.alerts.map((a) => <Alert key={a.message} tone={ALERT_TONE[a.level]}>{a.message}</Alert>)}
        </div>
      )}

      <Card>
        <CardHeader title="Breakdown" subtitle="Estimate vs approved quotes vs money spent. The bar shows each category's share of the total budget." />
        <div className="space-y-4">
          {s.rows.map((row) => {
            const share = s.budgetTotal ? Math.min(100, (row.expected / s.budgetTotal) * 100) : 0;
            const over = row.quoted > row.estimated || row.spent > row.estimated;
            return (
              <div key={row.category}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold">{meta.budgetCategoryLabels[row.category]}</span>
                  <span className="text-muted">
                    est. <strong className="text-ink">{formatTaka(row.estimated)}</strong> · quotes {formatTaka(row.quoted)} · spent {formatTaka(row.spent)}
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 rounded-full bg-paper">
                  <div className={`h-2.5 rounded-full ${over ? 'bg-danger' : 'bg-primary'}`} style={{ width: `${share}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Scenarios event={event} data={scenarios.data} canEdit={permissions.canEdit} onChanged={reloadAll} meta={meta} />
    </div>
  );
}

function Scenarios({ event, data, canEdit, onChanged, meta }) {
  const { budgets, scenarioLimit, planName } = data;
  const [selectedId, setSelectedId] = useState(budgets[0]?._id);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState(null);
  const selected = budgets.find((b) => b._id === selectedId) || budgets[0];

  async function makePrimary() {
    try {
      await eventsApi.makePrimary(selected._id);
      onChanged();
    } catch (err) {
      setMessage({ tone: 'danger', text: err.message });
    }
  }

  return (
    <Card>
      <CardHeader
        title="Budget scenarios"
        subtitle={`${budgets.length} of ${scenarioLimit} scenario(s) on the ${planName} plan. The primary scenario drives alerts and reports.`}
        action={canEdit && <Button size="sm" variant="secondary" icon="plus" onClick={() => setCreating(true)}>New scenario</Button>}
      />
      {message && <div className="mb-4"><Alert tone={message.tone}>{message.text}</Alert></div>}

      <div className="mb-5 flex flex-wrap gap-2" role="tablist">
        {budgets.map((b) => (
          <button
            key={b._id}
            type="button"
            role="tab"
            aria-selected={b._id === selected._id}
            onClick={() => setSelectedId(b._id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${b._id === selected._id ? 'border-primary bg-primary text-white' : 'border-line hover:border-primary'}`}
          >
            {b.name} {b.isPrimary && '★'}
          </button>
        ))}
      </div>

      {budgets.length > 1 && <CompareTable budgets={budgets} meta={meta} />}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* key: a fresh editor whenever the scenario or its version changes */}
        <ScenarioEditor key={`${selected._id}-${selected.version}`} budget={selected} canEdit={canEdit} onSaved={onChanged} meta={meta} />
        <div>
          {!selected.isPrimary && canEdit && (
            <Button size="sm" variant="secondary" className="mb-4" onClick={makePrimary}>Make primary</Button>
          )}
          <p className="mb-2 text-sm font-semibold">Version history</p>
          <ol className="space-y-3">
            {[...selected.versions].reverse().map((v) => (
              <li key={v.version} className="rounded-xl border border-line px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">v{v.version} · {formatTaka(v.total)}</span>
                  <Badge>{v.source.replace('_', ' ')}</Badge>
                </div>
                <p className="text-xs text-muted">{v.changedBy?.name || 'Someone'} · {formatDateTime(v.at)}</p>
                {v.reason && <p className="mt-1 text-xs italic">“{v.reason}”</p>}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {creating && <NewScenarioModal event={event} budgets={budgets} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); onChanged(); }} />}
    </Card>
  );
}

function CompareTable({ budgets, meta }) {
  const total = (b) => b.lines.reduce((sum, l) => sum + l.estimated, 0);
  return (
    <div className="-mx-5 mb-6 overflow-x-auto md:-mx-6">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-5 py-2 md:px-6">Category</th>
            {budgets.map((b) => <th key={b._id} className="px-3 py-2 text-right">{b.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {meta.budgetCategories.map((category) => (
            <tr key={category} className="border-b border-line/60">
              <td className="px-5 py-2 md:px-6">{meta.budgetCategoryLabels[category]}</td>
              {budgets.map((b) => <td key={b._id} className="px-3 py-2 text-right">{formatTaka(b.lines.find((l) => l.category === category)?.estimated || 0)}</td>)}
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="px-5 py-2 md:px-6">Total</td>
            {budgets.map((b) => <td key={b._id} className="px-3 py-2 text-right">{formatTaka(total(b))}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Editing creates a NEW version. We send the version we started from; if someone else saved
// in between, the server answers 409 and nothing is overwritten.
function ScenarioEditor({ budget, canEdit, onSaved, meta }) {
  const [lines, setLines] = useState(() => meta.budgetCategories.map((category) => {
    const line = budget.lines.find((l) => l.category === category);
    return { category, estimated: line?.estimated ?? 0, note: line?.note || '' };
  }));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((sum, l) => sum + (Number(l.estimated) || 0), 0);

  const setLine = (index, changes) => setLines(lines.map((l, i) => (i === index ? { ...l, ...changes } : l)));

  async function save() {
    setBusy(true);
    setMessage(null);
    setErrors({});
    try {
      await eventsApi.saveBudget(budget._id, {
        lines: lines.map((l) => ({ ...l, estimated: Number(l.estimated) || 0 })),
        reason,
        version: budget.version,
      });
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage({ tone: err.status === 409 ? 'warning' : 'danger', text: err.message });
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-3 text-sm font-semibold">{budget.name}, version {budget.version}</p>
      <div className="space-y-3">
        {lines.map((line, index) => (
          <div key={line.category} className="grid grid-cols-[1fr_1.4fr] items-end gap-3 sm:grid-cols-[110px_140px_1fr]">
            <span className="pb-2 text-sm font-medium">{meta.budgetCategoryLabels[line.category]}</span>
            <Input aria-label={`${line.category} estimate`} type="number" min="0" disabled={!canEdit} value={line.estimated} onChange={(e) => setLine(index, { estimated: e.target.value })} />
            <Input aria-label={`${line.category} note`} className="col-span-2 sm:col-span-1" placeholder="Note" disabled={!canEdit} value={line.note} onChange={(e) => setLine(index, { note: e.target.value })} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-right text-sm">Total <strong>{formatTaka(total)}</strong></p>
      {canEdit && (
        <div className="mt-4 space-y-3">
          <Textarea label="Why are you changing the budget?" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <Button loading={busy} icon="check" onClick={save}>Save as version {budget.version + 1}</Button>
        </div>
      )}
    </div>
  );
}

function NewScenarioModal({ event, budgets, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [copyFrom, setCopyFrom] = useState(budgets[0]?._id || '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await eventsApi.createScenario(event._id, { name, copyFrom: copyFrom || undefined });
      onCreated();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New budget scenario" footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button loading={busy} onClick={create}>Create</Button></>}>
      <div className="space-y-4">
        <Input label="Name" placeholder="e.g. Lean" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Start from</span>
          <select className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Empty (all zero)</option>
            {budgets.map((b) => <option key={b._id} value={b._id}>Copy of {b.name}</option>)}
          </select>
        </label>
        {error && (
          <Alert tone={error.status === 402 ? 'warning' : 'danger'} title={error.status === 402 ? 'Plan limit reached' : undefined}>{error.message}</Alert>
        )}
      </div>
    </Modal>
  );
}
