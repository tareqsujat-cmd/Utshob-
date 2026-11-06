import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fieldErrors } from '../../api/client.js';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { PageHeader, Alert } from '../../components/ui/Layout.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Input, Select, Checkbox } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { LoadingState } from '../../components/ui/States.jsx';
import { formatTaka, formatPackagePrice, toDateInput } from '../../components/ui/format.js';
import { LocationSearch } from '../../components/LocationSearch.jsx';
import { ResultsMap } from '../../components/ResultsMap.jsx';

const COLORS = { venue: '#0e5e5a', caterer: '#d9881a', restaurant: '#b8435e', planner: '#4b5d9b' };
// Which budget line pays for which kind of provider (to pre-fill budgets from an event).
const BUDGET_LINE = { venue: 'venue', caterer: 'food', restaurant: 'food', planner: 'decoration' };
const SERVICE_TO_CATEGORY = { venue: 'venue', catering: 'caterer', decoration: 'planner' };
const EXCLUDED_TEXT = {
  notBookable: 'without valid reviewed credentials',
  notServingArea: "don't serve this division",
  unavailableOnDate: 'unavailable on your date',
  missingServices: "don't offer the required services",
};

// M2-B: find up to 10 suitable providers per category, with reasons, flags and a map.
export function ProviderSearchPage() {
  const meta = useMeta();
  const events = useFetch('/events');
  const [criteria, setCriteria] = useState({
    location: { division: '', district: '', address: '' },
    date: '',
    guestCount: '',
    categories: ['venue', 'caterer'],
    budgets: {},
    services: [],
    preferences: [],
    venueId: '',
  });
  const [venueName, setVenueName] = useState('');
  const [results, setResults] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const update = (changes) => setCriteria((c) => ({ ...c, ...changes }));
  const toggle = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  // "Fill from my event": guests, date, place, needed providers and budgets from the event's budget lines.
  async function fillFromEvent(eventId) {
    if (!eventId) return;
    const [{ event }, summary] = await Promise.all([api.get(`/events/${eventId}`), api.get(`/events/${eventId}/budget-summary`)]);
    const lineOf = (category) => summary.rows.find((r) => r.category === BUDGET_LINE[category])?.estimated || 0;
    const categories = event.requiredServices.map((s) => SERVICE_TO_CATEGORY[s]).filter(Boolean);
    const budgets = {};
    for (const c of meta.providerCategories) if (lineOf(c)) budgets[c] = lineOf(c);
    update({
      location: { ...event.location, source: event.location.lat ? 'event' : 'manual' },
      date: toDateInput(event.startsAt),
      guestCount: event.guestCount,
      categories: categories.length ? categories : criteria.categories,
      budgets,
    });
  }

  async function search(overrides = {}) {
    const body = { ...criteria, ...overrides };
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const data = await api.post('/providers/search', {
        location: { division: body.location.division, district: body.location.district, lat: body.location.lat, lng: body.location.lng },
        date: body.date || undefined,
        guestCount: Number(body.guestCount),
        categories: body.categories,
        budgets: Object.fromEntries(Object.entries(body.budgets).filter(([c, v]) => body.categories.includes(c) && Number(v) > 0).map(([c, v]) => [c, Number(v)])),
        services: body.services,
        preferences: body.preferences,
        venueId: body.venueId || undefined,
      });
      setResults(data.results);
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function useVenue(match) {
    update({ venueId: match.provider._id });
    setVenueName(match.provider.businessName);
    search({ venueId: match.provider._id });
  }

  if (!meta) return <LoadingState />;
  const mapPoints = results
    ? Object.entries(results).flatMap(([category, r]) =>
      r.results.map((m, i) => ({ ...m.provider.location, label: i + 1, color: COLORS[category], title: `${i + 1}. ${m.provider.businessName}` })))
    : [];

  return (
    <div>
      <PageHeader eyebrow="Plan" title="Find providers" subtitle="Up to 10 credential-reviewed providers per category that fit your place, date, guests and budget, with the reasons." />
      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        <Card className="h-fit">
          <CardHeader title="What you need" />
          <div className="space-y-5">
            <Select
              label="Fill from my event (optional)"
              placeholder="Choose an event"
              options={(events.data?.events || []).filter((e) => ['draft', 'planned'].includes(e.status)).map((e) => ({ value: e._id, label: e.title }))}
              onChange={(e) => fillFromEvent(e.target.value)}
            />
            <div>
              <p className="mb-2 text-sm font-medium">Where</p>
              <LocationSearch meta={meta} value={criteria.location} onChange={(location) => update({ location })} />
              {(errors['location.division'] || errors['location.district']) && <p className="mt-1 text-xs text-danger">{errors['location.division'] || errors['location.district']}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Date" type="date" value={criteria.date} onChange={(e) => update({ date: e.target.value })} />
              <Input label="Guests" type="number" min="1" required value={criteria.guestCount} onChange={(e) => update({ guestCount: e.target.value })} error={errors.guestCount} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Looking for</p>
              <div className="space-y-2">
                {meta.providerCategories.map((c) => (
                  <div key={c} className="grid grid-cols-[1fr_130px] items-center gap-2">
                    <Checkbox label={meta.providerCategoryLabels[c]} checked={criteria.categories.includes(c)} onChange={() => update({ categories: toggle(criteria.categories, c) })} />
                    <Input aria-label={`${c} budget`} type="number" min="0" placeholder="Budget ৳" disabled={!criteria.categories.includes(c)} value={criteria.budgets[c] ?? ''} onChange={(e) => update({ budgets: { ...criteria.budgets, [c]: e.target.value } })} />
                  </div>
                ))}
              </div>
              {errors.categories && <p className="mt-1 text-xs text-danger">{errors.categories}</p>}
            </div>
            <TagPicker title="Must offer" meta={meta} selected={criteria.services} onChange={(services) => update({ services })} />
            <TagPicker title="Nice to have" meta={meta} selected={criteria.preferences} onChange={(preferences) => update({ preferences })} />
            {criteria.venueId && (
              <Alert tone="info" title={`Venue: ${venueName}`} action={<button type="button" className="text-xs font-semibold underline" onClick={() => { update({ venueId: '' }); setVenueName(''); }}>Clear</button>}>
                Caterers are checked against this venue's outside-catering rule.
              </Alert>
            )}
            {error && <Alert tone="danger">{error}</Alert>}
            <Button className="w-full" size="lg" icon="search" loading={busy} onClick={() => search()}>Find providers</Button>
          </div>
        </Card>

        <div className="space-y-6">
          {!results && <Card><p className="py-10 text-center text-sm text-muted">Set your needs and press <strong>Find providers</strong>.</p></Card>}
          {results && <ResultsMap points={[...(criteria.location.lat ? [{ ...criteria.location, label: '★', color: '#1c2b2d', title: 'Your location' }] : []), ...mapPoints]} />}
          {results && Object.entries(results).map(([category, r]) => (
            <CategoryResults key={category} category={category} data={r} meta={meta} onUseVenue={useVenue} chosenVenueId={criteria.venueId} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TagPicker({ title, meta, selected, onChange }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {meta.providerTags.map((t) => {
          const on = selected.includes(t);
          return (
            <button key={t} type="button" aria-pressed={on} onClick={() => onChange(on ? selected.filter((x) => x !== t) : [...selected, t])}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? 'border-primary bg-primary text-white' : 'border-line hover:border-primary'}`}>
              {meta.providerTagLabels[t]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CategoryResults({ category, data, meta, onUseVenue, chosenVenueId }) {
  const hidden = Object.entries(data.excluded).filter(([, n]) => n > 0).map(([why, n]) => `${n} ${EXCLUDED_TEXT[why]}`);
  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ background: COLORS[category] }} />{meta.providerCategoryLabels[category]}</span>}
        subtitle={[data.note, hidden.length ? `Hidden: ${hidden.join('; ')}.` : null].filter(Boolean).join(' ')}
      />
      <ol className="space-y-4">
        {data.results.map((m, i) => (
          <li key={m.provider._id} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: COLORS[category] }}>{i + 1}</span>
                <div>
                  <Link to={`/providers/${m.provider._id}`} className="font-semibold hover:text-primary">{m.provider.businessName}</Link>
                  <p className="text-xs text-muted">{m.provider.district}, {m.provider.division}{m.distanceKm !== null && ` · ${m.distanceKm} km`}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.provider.reviewCount > 0
                  ? <Badge tone="success"><Icon name="star" size={12} /> {m.provider.ratingAvg.toFixed(1)} · {m.provider.reviewCount} reviews</Badge>
                  : <Badge>No reviews yet</Badge>}
                {m.limitedHistory && <Badge tone="warning">Limited history</Badge>}
              </div>
            </div>
            {m.package && (
              <p className="mt-3 text-sm">
                <strong>{m.package.name}</strong> · {formatPackagePrice(m.package)} → about <strong>{formatTaka(m.estimatedCost)}</strong> for your guests
              </p>
            )}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <ul className="space-y-1 text-sm">
                <li className="text-xs font-semibold uppercase tracking-wide text-muted">Why this matches</li>
                {m.reasons.map((r) => <li key={r} className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-success" />{r}</li>)}
              </ul>
              {m.flags.length > 0 && (
                <ul className="space-y-1 text-sm">
                  <li className="text-xs font-semibold uppercase tracking-wide text-muted">Check this</li>
                  {m.flags.map((f) => <li key={f} className="flex gap-2"><Icon name="alert" size={15} className="mt-0.5 shrink-0 text-warning" />{f}</li>)}
                </ul>
              )}
            </div>
            {category === 'venue' && (
              <div className="mt-3">
                {chosenVenueId === m.provider._id
                  ? <Badge tone="primary">Your chosen venue</Badge>
                  : <Button size="sm" variant="secondary" onClick={() => onUseVenue(m)}>Use as my venue</Button>}
              </div>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
