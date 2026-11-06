import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch.js';
import { surplusApi, newIdempotencyKey } from '../../api/m1c.surplus.api.js';
import { PageHeader, Alert } from '../../components/ui/Layout.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { formatQty } from '../../components/ui/format.js';
import { DeadlineLabel } from './SurplusParts.jsx';

// M1-C: open listings that suit one request, best first, with the reasons.
export function MatchesPage() {
  const { id } = useParams();
  const { data, loading, error, reload } = useFetch(`/food-requests/${id}/matches`);

  if (loading && !data) return <LoadingState label="Finding matches…" />; // only on the first load
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { request, matches, stillNeeded, hiddenForAllergens } = data;

  return (
    <div>
      <PageHeader
        eyebrow="Food · matches"
        title={request.title}
        subtitle={`Still needed: ${formatQty(stillNeeded)} ${request.unit}. Receive up to ${request.receivingCapacity}, carry up to ${request.collectionCapacity} per trip.`}
        actions={<Link to="/food-requests" className="text-sm font-semibold text-primary hover:underline">← Back to requests</Link>}
      />
      {hiddenForAllergens > 0 && (
        <div className="mb-4"><Alert tone="info">{hiddenForAllergens} listing(s) hidden because they contain allergens you avoid.</Alert></div>
      )}
      {matches.length === 0 && <Card><EmptyState icon="search" title="No suitable surplus right now" message="You will be notified when new food is shared in your division." /></Card>}

      <div className="space-y-4">
        {matches.map((m, index) => (
          <MatchCard key={m.listing._id} match={m} rank={index + 1} request={request} onReserved={reload} />
        ))}
      </div>
    </div>
  );
}

function MatchCard({ match, rank, request, onReserved }) {
  const { listing } = match;
  const [quantity, setQuantity] = useState(match.suggestedQuantity);
  const [key, setKey] = useState(newIdempotencyKey);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function reserve() {
    setBusy(true);
    setMessage(null);
    try {
      await surplusApi.reserve({ listingId: listing._id, requestId: request._id, quantity: Number(quantity) }, key);
      setKey(newIdempotencyKey());
      setMessage({ tone: 'success', text: `Reserved ${quantity} ${listing.unit}.` });
      onReserved();
    } catch (err) {
      setMessage({ tone: err.status === 409 ? 'warning' : 'danger', text: err.message });
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Match #{rank} · score {match.score}</p>
          <Link to={`/surplus/${listing._id}`} className="text-lg font-semibold hover:text-primary">{listing.foodType}</Link>
          <p className="text-sm text-muted">{formatQty(match.available)} {listing.unit} available · shared by {listing.postedBy?.name} · {listing.pickupLocation.address || listing.pickupLocation.district}</p>
        </div>
        <DeadlineLabel deadline={listing.pickupDeadline} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1.5 text-sm font-semibold">Why this matches</p>
          <ul className="space-y-1 text-sm">
            {match.reasons.map((r) => <li key={r} className="flex gap-2"><Icon name="check" size={16} className="mt-0.5 text-success" />{r}</li>)}
          </ul>
        </div>
        {match.warnings.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-semibold">Check before accepting</p>
            <ul className="space-y-1 text-sm">
              {match.warnings.map((w) => <li key={w} className="flex gap-2"><Icon name="alert" size={16} className="mt-0.5 text-warning" />{w}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <Input label={`Reserve (${listing.unit})`} type="number" min="0" step="0.1" className="w-40" value={quantity} onChange={(e) => setQuantity(e.target.value)} hint={`Suggested: ${match.suggestedQuantity}`} />
        <Badge tone="primary" className="mb-6">{match.suggestedBecause}</Badge>
        <Button icon="check" className="mb-5" loading={busy} disabled={!Number(quantity)} onClick={reserve}>Reserve</Button>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </Card>
  );
}
