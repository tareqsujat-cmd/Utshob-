import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { fieldErrors } from '../../api/client.js';
import { surplusApi } from '../../api/m1c.surplus.api.js';
import { PageHeader, Alert } from '../../components/ui/Layout.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Input, Select, Textarea, Checkbox } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { LoadingState } from '../../components/ui/States.jsx';
import { DivisionDistrictSelect } from '../../components/DivisionDistrictSelect.jsx';
import { MapPicker } from '../../components/MapPicker.jsx';
import { fromLocalInput, toLocalInput } from '../../components/ui/format.js';
import { AllergenPicker } from './SurplusParts.jsx';

// M1-C: a host (for one of their events) or a provider offers surplus food.
export function SurplusFormPage() {
  const { user } = useAuth();
  const meta = useMeta();
  // Hosts pick one of their events; providers start from their business address.
  const events = useFetch(user.role === 'host' ? '/events' : null);
  const provider = useFetch(user.role === 'provider' ? '/providers/me' : null);

  if (!meta || events.loading || provider.loading) return <LoadingState />;
  const usableEvents = (events.data?.events || []).filter((e) => e.status !== 'draft');
  return <SurplusForm meta={meta} isHost={user.role === 'host'} events={usableEvents} provider={provider.data?.provider} />;
}

function SurplusForm({ meta, isHost, events, provider }) {
  const navigate = useNavigate();
  const startLocation = provider
    ? { address: provider.address, division: provider.division, district: provider.district, ...(provider.location?.lat ? provider.location : {}) }
    : { address: '', division: '', district: '' };

  const [form, setForm] = useState({
    eventId: '',
    foodType: '',
    description: '',
    unit: 'portion',
    quantityTotal: '',
    preparedAt: '',
    preparationMethod: '',
    packaging: '',
    storageCondition: '',
    pickupLocation: startLocation,
    pickupDeadline: toLocalInput(new Date(Date.now() + 4 * 3600000)),
    ingredientsText: '',
    allergens: [],
    allergensDeclared: false,
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const update = (changes) => setForm((current) => ({ ...current, ...changes }));
  const updateLocation = (changes) => update({ pickupLocation: { ...form.pickupLocation, ...changes } });

  // Choosing an event fills the pickup place with the event's location.
  function chooseEvent(eventId) {
    const event = events.find((e) => e._id === eventId);
    update({ eventId, pickupLocation: event ? { ...event.location } : form.pickupLocation });
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    const { ingredientsText, preparedAt, pickupDeadline, packaging, storageCondition, eventId, ...rest } = form;
    try {
      const result = await surplusApi.createListing({
        ...rest,
        eventId: eventId || undefined,
        quantityTotal: Number(form.quantityTotal),
        preparedAt: preparedAt ? fromLocalInput(preparedAt) : undefined,
        pickupDeadline: fromLocalInput(pickupDeadline),
        packaging: packaging || undefined,
        storageCondition: storageCondition || undefined,
        ingredients: ingredientsText.split(',').map((s) => s.trim()).filter(Boolean),
      });
      navigate(`/surplus/${result.listing._id}`);
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err);
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Share food" title="Share surplus food" subtitle="Coordinators of orphanages and outreach teams nearby are notified and can reserve it." />
      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader title="The food" />
          <div className="grid gap-4 md:grid-cols-2">
            {isHost && (
              <Select
                label="From which event?"
                required
                className="md:col-span-2"
                value={form.eventId}
                placeholder="Choose event"
                options={events.map((e) => ({ value: e._id, label: `${e.title} (${e.status})` }))}
                onChange={(e) => chooseEvent(e.target.value)}
                error={errors.eventId}
              />
            )}
            <Input label="What food?" required placeholder="e.g. Vegetable khichuri" value={form.foodType} onChange={(e) => update({ foodType: e.target.value })} error={errors.foodType} />
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <Input label="Quantity" type="number" min="0" step="0.1" required value={form.quantityTotal} onChange={(e) => update({ quantityTotal: e.target.value })} error={errors.quantityTotal} />
              <Select label="Unit" value={form.unit} options={meta.foodUnits.map((u) => ({ value: u, label: u }))} onChange={(e) => update({ unit: e.target.value })} />
            </div>
            <Textarea label="Description" className="md:col-span-2" rows={2} value={form.description} onChange={(e) => update({ description: e.target.value })} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Preparation & safety" subtitle="Storage is as you report it; coordinators decide whether to accept." />
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Prepared at" type="datetime-local" value={form.preparedAt} onChange={(e) => update({ preparedAt: e.target.value })} error={errors.preparedAt} />
            <Input label="How it was prepared" placeholder="e.g. Cooked in large pots" value={form.preparationMethod} onChange={(e) => update({ preparationMethod: e.target.value })} />
            <Select label="Packaging" value={form.packaging} placeholder="Choose packaging" options={meta.packagingTypes.map((p) => ({ value: p, label: meta.packagingLabels[p] }))} onChange={(e) => update({ packaging: e.target.value })} />
            <Select label="Storage condition" value={form.storageCondition} placeholder="Choose condition" options={meta.storageConditions.map((s) => ({ value: s, label: meta.storageLabels[s] }))} onChange={(e) => update({ storageCondition: e.target.value })} />
            <Input label="Ingredients (comma separated)" className="md:col-span-2" placeholder="rice, lentils, potato" value={form.ingredientsText} onChange={(e) => update({ ingredientsText: e.target.value })} />
          </div>
          <p className="mb-2 mt-5 text-sm font-medium">Allergens it contains</p>
          <AllergenPicker meta={meta} selected={form.allergens} onChange={(allergens) => update({ allergens })} />
          <Checkbox
            className="mt-4"
            label="This allergen list is complete"
            hint="Tick it even if there are none. If unticked, the listing is flagged as missing allergen information."
            checked={form.allergensDeclared}
            onChange={(e) => update({ allergensDeclared: e.target.checked })}
          />
        </Card>

        <Card>
          <CardHeader title="Pickup" subtitle="Where and until when collectors can pick the food up." />
          <div className="space-y-4">
            <Input label="Pickup deadline" type="datetime-local" required value={form.pickupDeadline} onChange={(e) => update({ pickupDeadline: e.target.value })} error={errors.pickupDeadline} />
            <DivisionDistrictSelect meta={meta} division={form.pickupLocation.division} district={form.pickupLocation.district} onChange={updateLocation} errors={{ division: errors['pickupLocation.division'], district: errors['pickupLocation.district'] }} />
            <Input label="Address" value={form.pickupLocation.address} onChange={(e) => updateLocation({ address: e.target.value })} />
            <MapPicker
              value={form.pickupLocation.lat ? form.pickupLocation : null}
              onChange={({ lat, lng }) => updateLocation({ lat, lng })}
              center={meta.divisionCenters[form.pickupLocation.division] || meta.divisionCenters.Dhaka}
              height={220}
            />
          </div>
        </Card>

        {error && (
          <Alert tone={error.status === 409 ? 'warning' : 'danger'} title={error.status === 409 ? 'Already listed' : undefined}>{error.message}</Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" size="lg" icon="leaf" loading={busy}>Share surplus</Button>
        </div>
      </form>
    </div>
  );
}
