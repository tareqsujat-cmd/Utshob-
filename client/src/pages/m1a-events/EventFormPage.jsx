import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { fieldErrors } from '../../api/client.js';
import { eventsApi } from '../../api/m1a.events.api.js';
import { PageHeader, Alert } from '../../components/ui/Layout.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Input, Select, Textarea, Checkbox } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { LoadingState, ErrorState } from '../../components/ui/States.jsx';
import { DivisionDistrictSelect } from '../../components/DivisionDistrictSelect.jsx';
import { MapPicker } from '../../components/MapPicker.jsx';
import { fromLocalInput } from '../../components/ui/format.js';

// M1-A: create a new event (/events/new) or edit one (/events/:id/edit).
export function EventFormPage() {
  const { id } = useParams();
  const meta = useMeta();
  const existing = useFetch(id ? `/events/${id}` : null);

  if (!meta || existing.loading) return <LoadingState />;
  if (existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />;
  return <EventForm meta={meta} event={existing.data?.event} />;
}

function initialForm(event) {
  return {
    title: event?.title || '',
    eventType: event?.eventType || '',
    startsAt: '',
    endsAt: '',
    saveAsDraft: false,
    location: event?.location || { division: '', district: '', address: '' },
    guestCount: event?.guestCount ?? '',
    budgetTotal: event?.budgetTotal ?? '',
    requiredServices: event?.requiredServices || [],
    dietary: event?.dietary || [],
    notes: event?.notes || '',
    reason: '',
  };
}

// The fields whose change needs a reason (same list as the server's REQUIREMENT_FIELDS).
const requirementsOf = (f) =>
  JSON.stringify([Number(f.guestCount), Number(f.budgetTotal), f.location, f.dietary, f.requiredServices]);

function EventForm({ meta, event }) {
  const navigate = useNavigate();
  const isEdit = Boolean(event);
  const [form, setForm] = useState(() => initialForm(event));
  const [initialRequirements] = useState(() => requirementsOf(initialForm(event)));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = (changes) => setForm((current) => ({ ...current, ...changes }));
  const updateLocation = (changes) => update({ location: { ...form.location, ...changes } });
  const requirementChanged = isEdit && requirementsOf(form) !== initialRequirements;

  const toggleService = (service) =>
    update({
      requiredServices: form.requiredServices.includes(service)
        ? form.requiredServices.filter((s) => s !== service)
        : [...form.requiredServices, service],
    });

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    const body = {
      title: form.title,
      eventType: form.eventType,
      location: form.location,
      guestCount: Number(form.guestCount),
      budgetTotal: Number(form.budgetTotal),
      requiredServices: form.requiredServices,
      dietary: form.dietary.map((d) => ({ label: d.label, guestCount: Number(d.guestCount) })),
      notes: form.notes,
    };
    try {
      if (isEdit) {
        const result = await eventsApi.update(event._id, { ...body, reason: form.reason });
        navigate(`/events/${event._id}`, {
          state: result.foodPlanNeedsReview ? { message: 'Guest count changed. Review the food plan for the new numbers.' } : null,
        });
      } else {
        const result = await eventsApi.create({
          ...body,
          startsAt: fromLocalInput(form.startsAt),
          endsAt: fromLocalInput(form.endsAt),
          status: form.saveAsDraft ? 'draft' : 'planned',
        });
        navigate(`/events/${result.event._id}`);
      }
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Plan" title={isEdit ? `Edit ${event.title}` : 'Plan an event'} subtitle="Requirements drive your budget, provider search and food plan." />
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader title="The event" />
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Title" required value={form.title} onChange={(e) => update({ title: e.target.value })} error={errors.title} placeholder="e.g. Wedding reception" />
            <Select
              label="Type"
              required
              value={form.eventType}
              placeholder="Choose type"
              options={meta.eventTypes.map((t) => ({ value: t, label: meta.eventTypeLabels[t] }))}
              onChange={(e) => update({ eventType: e.target.value })}
              error={errors.eventType}
            />
            {!isEdit && (
              <>
                <Input label="Starts" type="datetime-local" required value={form.startsAt} onChange={(e) => update({ startsAt: e.target.value })} error={errors.startsAt} />
                <Input label="Ends" type="datetime-local" required value={form.endsAt} onChange={(e) => update({ endsAt: e.target.value })} error={errors.endsAt} />
              </>
            )}
            {isEdit && (
              <p className="text-sm text-muted md:col-span-2">To change the date, use <strong>Reschedule</strong> on the event page; it notifies everyone involved.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Guests & budget" />
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Expected guests" type="number" min="1" required value={form.guestCount} onChange={(e) => update({ guestCount: e.target.value })} error={errors.guestCount} />
            <Input label="Total budget (৳)" type="number" min="0" required value={form.budgetTotal} onChange={(e) => update({ budgetTotal: e.target.value })} error={errors.budgetTotal} />
          </div>
          <p className="mb-2 mt-5 text-sm font-medium">Services you need</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {meta.requiredServices.map((service) => (
              <Checkbox key={service} label={meta.serviceLabels[service]} checked={form.requiredServices.includes(service)} onChange={() => toggleService(service)} />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Location" subtitle="Optionally pin the venue on the map." />
          <div className="space-y-4">
            <DivisionDistrictSelect
              meta={meta}
              division={form.location.division}
              district={form.location.district}
              onChange={updateLocation}
              errors={{ division: errors['location.division'], district: errors['location.district'] }}
            />
            <Input label="Address / venue" value={form.location.address} onChange={(e) => updateLocation({ address: e.target.value })} />
            <MapPicker
              value={form.location.lat ? form.location : null}
              onChange={({ lat, lng }) => updateLocation({ lat, lng })}
              center={meta.divisionCenters[form.location.division] || meta.divisionCenters.Dhaka}
              height={220}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Dietary requirements" subtitle="How many guests need special food." />
          <div className="space-y-3">
            {form.dietary.map((row, index) => (
              <div key={index} className="flex items-end gap-3">
                <Select
                  label={index === 0 ? 'Need' : undefined}
                  aria-label="Dietary need"
                  className="flex-1"
                  value={row.label}
                  options={Object.entries(meta.dietaryLabels).map(([value, label]) => ({ value, label }))}
                  onChange={(e) => update({ dietary: form.dietary.map((d, i) => (i === index ? { ...d, label: e.target.value } : d)) })}
                />
                <Input
                  label={index === 0 ? 'Guests' : undefined}
                  aria-label="Number of guests"
                  type="number"
                  min="0"
                  className="w-28"
                  value={row.guestCount}
                  onChange={(e) => update({ dietary: form.dietary.map((d, i) => (i === index ? { ...d, guestCount: e.target.value } : d)) })}
                />
                <button type="button" onClick={() => update({ dietary: form.dietary.filter((_, i) => i !== index) })} className="mb-1 rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger" aria-label="Remove">
                  <Icon name="x" size={18} />
                </button>
              </div>
            ))}
            <Button variant="secondary" size="sm" icon="plus" onClick={() => update({ dietary: [...form.dietary, { label: 'vegetarian', guestCount: 1 }] })}>
              Add dietary need
            </Button>
          </div>
          <Textarea label="Notes" className="mt-5" value={form.notes} onChange={(e) => update({ notes: e.target.value })} />
        </Card>

        {isEdit && (
          <Card>
            <Textarea
              label="Reason for the change"
              required={requirementChanged}
              hint="Required when guest count, budget, location, dietary needs or services change. It is saved in the event history."
              value={form.reason}
              onChange={(e) => update({ reason: e.target.value })}
              error={errors.reason}
            />
          </Card>
        )}

        {!isEdit && <Checkbox label="Save as draft (not planned yet)" checked={form.saveAsDraft} onChange={(e) => update({ saveAsDraft: e.target.checked })} />}
        {error && <Alert tone={error.includes('plan allows') ? 'warning' : 'danger'} title={error.includes('plan allows') ? 'Plan limit reached' : undefined}>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" size="lg" loading={busy} icon="check">{isEdit ? 'Save changes' : 'Create event'}</Button>
        </div>
      </form>
    </div>
  );
}
