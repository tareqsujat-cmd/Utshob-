import { Badge } from '../../components/ui/Badge.jsx';
import { formatDateTime, formatQty } from '../../components/ui/format.js';

// Small pieces shared by the surplus pages.

// Total split into reserved / still available / wasted, as a bar with numbers.
export function QuantityBar({ listing }) {
  const total = listing.quantityTotal || 1;
  const pct = (n) => `${(n / total) * 100}%`;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-paper">
        <div className="bg-primary" style={{ width: pct(listing.quantityReserved) }} title="Reserved" />
        <div className="bg-accent" style={{ width: pct(listing.available) }} title="Available" />
        <div className="bg-line" style={{ width: pct(listing.quantityWastedUnreserved || 0) }} title="Wasted" />
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-primary" />Reserved {formatQty(listing.quantityReserved)}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-accent" />Available {formatQty(listing.available)}</span>
        <span>of {formatQty(listing.quantityTotal)} {listing.unit}</span>
      </p>
    </div>
  );
}

// "closes in 5 h" / "closed 2 h ago"
export function DeadlineLabel({ deadline }) {
  const hours = Math.round((new Date(deadline).getTime() - Date.now()) / 3600000);
  if (hours < 0) return <Badge tone="neutral">Deadline passed</Badge>;
  return (
    <span className="text-sm text-muted">
      Pickup by <strong className="text-ink">{formatDateTime(deadline)}</strong>{' '}
      <Badge tone={hours <= 3 ? 'warning' : 'primary'}>{hours < 1 ? 'less than 1 h left' : `${hours} h left`}</Badge>
    </span>
  );
}

export function MissingInfo({ missing }) {
  if (!missing?.length) return <Badge tone="success">Information complete</Badge>;
  return <Badge tone="warning">Missing: {missing.join(', ')}</Badge>;
}

// Toggle chips for allergens. `selected` is an array of allergen keys.
export function AllergenPicker({ meta, selected, onChange, disabled = false }) {
  const toggle = (a) => onChange(selected.includes(a) ? selected.filter((x) => x !== a) : [...selected, a]);
  return (
    <div className="flex flex-wrap gap-2">
      {meta.allergens.map((a) => {
        const on = selected.includes(a);
        return (
          <button
            key={a}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => toggle(a)}
            className={`rounded-full border px-3 py-1 text-sm ${on ? 'border-danger bg-danger-soft font-semibold text-danger' : 'border-line bg-card hover:border-danger'}`}
          >
            {meta.allergenLabels[a]}
          </button>
        );
      })}
    </div>
  );
}
