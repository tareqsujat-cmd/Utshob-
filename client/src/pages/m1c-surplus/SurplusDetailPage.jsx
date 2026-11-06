import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { surplusApi, newIdempotencyKey } from '../../api/m1c.surplus.api.js';
import { PageHeader, Alert } from '../../components/ui/Layout.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { LoadingState, ErrorState } from '../../components/ui/States.jsx';
import { formatDateTime, formatQty } from '../../components/ui/format.js';
import { MapPicker } from '../../components/MapPicker.jsx';
import { QuantityBar, DeadlineLabel, MissingInfo } from './SurplusParts.jsx';

// M1-C: one listing. Coordinators reserve part of it; the poster can correct the quantity or cancel.
export function SurplusDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const meta = useMeta();
  const { data, loading, error, reload } = useFetch(`/surplus/${id}`);

  if ((loading && !data) || !meta) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { listing, reservations } = data;
  const isPoster = listing.postedBy._id === user._id;
  const isCoordinator = Boolean(user.organization);
  const loc = listing.pickupLocation;

  return (
    <div>
      <PageHeader
        eyebrow={`Surplus · shared by ${listing.postedBy.name}${listing.event ? ` from ${listing.event.title}` : ''}`}
        title={`${formatQty(listing.quantityTotal)} ${listing.unit} ${listing.foodType}`}
        subtitle={listing.description}
        actions={<StatusBadge status={listing.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <QuantityBar listing={listing} />
            <div className="mt-4 flex flex-wrap items-center gap-2"><DeadlineLabel deadline={listing.pickupDeadline} /></div>
          </Card>

          {isCoordinator && ['open', 'fully_reserved'].includes(listing.status) && <ReserveForm listing={listing} onReserved={reload} />}
          {isPoster && <PosterActions listing={listing} onChanged={reload} />}

          <Card>
            <CardHeader title="Food details" subtitle="As reported by the person sharing it." />
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted">Prepared</dt><dd>{formatDateTime(listing.preparation?.preparedAt)}{listing.preparation?.method && ` · ${listing.preparation.method}`}</dd></div>
              <div><dt className="text-xs text-muted">Storage (reported)</dt><dd>{meta.storageLabels[listing.storageCondition] || '—'}</dd></div>
              <div><dt className="text-xs text-muted">Packaging</dt><dd>{meta.packagingLabels[listing.packaging] || '—'}</dd></div>
              <div><dt className="text-xs text-muted">Ingredients</dt><dd>{listing.ingredients.join(', ') || '—'}</dd></div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted">Allergens</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {listing.allergens.map((a) => <Badge key={a} tone="danger">{meta.allergenLabels[a]}</Badge>)}
                  {listing.allergensDeclared && listing.allergens.length === 0 && <Badge tone="success">None declared</Badge>}
                  {!listing.allergensDeclared && <Badge tone="warning">Not declared</Badge>}
                </dd>
              </div>
            </dl>
            <div className="mt-4"><MissingInfo missing={listing.missingInfo} /></div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Pickup place" />
            <p className="mb-3 text-sm">{[loc.address, loc.district, loc.division].filter(Boolean).join(', ')}</p>
            {loc.lat && <MapPicker readOnly value={loc} center={loc} height={200} />}
          </Card>
          <Card>
            <CardHeader title="Reservations" subtitle="One listing can be shared between several organizations." />
            {reservations.length === 0 && <p className="text-sm text-muted">No reservations yet.</p>}
            <ul className="space-y-2">
              {reservations.map((r) => (
                <li key={r._id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                  <span><strong>{r.organization.name}</strong> <span className="text-muted">({r.organization.type})</span></span>
                  <span>{formatQty(r.quantityReserved)} {r.unit} <StatusBadge status={r.status} /></span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Reserve part of the listing for one of my organization's open requests.
// A fresh Idempotency-Key is made for each attempt; a double-click re-sends the SAME key.
function ReserveForm({ listing, onReserved }) {
  const requests = useFetch('/food-requests/mine');
  const open = (requests.data?.requests || []).filter((r) => ['open', 'partially_matched'].includes(r.status) && r.unit === listing.unit);
  const [requestId, setRequestId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function reserve() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await surplusApi.reserve({ listingId: listing._id, requestId, quantity: Number(quantity) }, key);
      setMessage({ tone: 'success', text: `Reserved ${result.reservation.quantityReserved} ${listing.unit}.` });
      setKey(newIdempotencyKey()); // next reservation = new key
      setQuantity('');
      onReserved();
    } catch (err) {
      setMessage({ tone: err.status === 409 ? 'warning' : 'danger', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Reserve for my organization" subtitle={`${formatQty(listing.available)} ${listing.unit} still available`} />
      {listing.status !== 'open' && <p className="text-sm text-muted">Everything is reserved. Food comes back here if a reservation is cancelled.</p>}
      {listing.status === 'open' && requests.data && open.length === 0 && <p className="text-sm text-muted">You have no open request in {listing.unit}. Create one under Food requests first.</p>}
      {listing.status === 'open' && open.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr_auto] sm:items-end">
          <Select label="For request" value={requestId} placeholder="Choose request" options={open.map((r) => ({ value: r._id, label: `${r.title} (still need ${formatQty(r.quantityNeeded - r.quantityMatched)})` }))} onChange={(e) => setRequestId(e.target.value)} />
          <Input label={`Quantity (${listing.unit})`} type="number" min="0" step="0.1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <Button icon="check" loading={busy} disabled={!requestId || !quantity} onClick={reserve}>Reserve</Button>
        </div>
      )}
      {message && <div className="mt-4"><Alert tone={message.tone}>{message.text}</Alert></div>}
    </Card>
  );
}

function PosterActions({ listing, onChanged }) {
  const [quantity, setQuantity] = useState(listing.quantityTotal);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState(null);
  const editable = ['open', 'fully_reserved'].includes(listing.status);

  async function saveQuantity() {
    setMessage(null);
    try {
      await surplusApi.updateListing(listing._id, {
        quantityTotal: Number(quantity),
        description: listing.description,
        preparedAt: listing.preparation?.preparedAt,
        preparationMethod: listing.preparation?.method || '',
        packaging: listing.packaging,
        storageCondition: listing.storageCondition,
        ingredients: listing.ingredients,
        allergens: listing.allergens,
        allergensDeclared: listing.allergensDeclared,
      });
      setMessage({ tone: 'success', text: 'Quantity updated.' });
      onChanged();
    } catch (err) {
      setMessage({ tone: 'warning', text: err.message });
    }
  }

  async function cancel() {
    try {
      await surplusApi.cancelListing(listing._id, reason);
      setCancelling(false);
      onChanged();
    } catch (err) {
      setCancelling(false);
      setMessage({ tone: 'warning', text: err.message });
    }
  }

  if (!editable) return null;
  return (
    <Card>
      <CardHeader title="Manage this listing" subtitle="The quantity can't go below what is already reserved." />
      <div className="flex flex-wrap items-end gap-3">
        <Input label={`Total quantity (${listing.unit})`} type="number" min="0" step="0.1" className="w-48" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <Button variant="secondary" onClick={saveQuantity}>Save quantity</Button>
        <Button variant="ghost" icon="ban" onClick={() => setCancelling(true)}>Cancel listing</Button>
      </div>
      {message && <div className="mt-4"><Alert tone={message.tone}>{message.text}</Alert></div>}
      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel this listing?"
        footer={<><Button variant="secondary" onClick={() => setCancelling(false)}>Keep it</Button><Button variant="danger" disabled={reason.trim().length < 3} onClick={cancel}>Cancel listing</Button></>}
      >
        <p className="mb-3 text-sm">Only possible while nobody has reserved any of it.</p>
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </Card>
  );
}
