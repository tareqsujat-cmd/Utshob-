import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { fieldErrors } from '../../api/client.js';
import { providersApi } from '../../api/m1b.providers.api.js';
import { PageHeader, Alert } from '../../components/ui/Layout.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Input, Select, Textarea, Checkbox } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { LoadingState, ErrorState } from '../../components/ui/States.jsx';
import { DivisionDistrictSelect } from '../../components/DivisionDistrictSelect.jsx';
import { MapPicker } from '../../components/MapPicker.jsx';
import { BookabilityPanel } from './BookabilityPanel.jsx';

// M1-B: the provider creates or edits its business profile.
export function ProviderProfilePage() {
  const { data, loading, error, reload } = useFetch('/providers/me');
  const meta = useMeta();

  return (
    <div>
      <PageHeader
        eyebrow="My business"
        title={data?.provider ? data.provider.businessName : 'Create your business profile'}
        subtitle="Hosts see this when they compare providers. Keep capacity and service areas accurate."
      />
      {(loading || !meta) && <LoadingState />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && meta && (
        <>
          {data.provider && (
            <div className="mb-6">
              <BookabilityPanel bookability={data.bookability} own />
            </div>
          )}
          {/* key: rebuild the form with fresh values after each save */}
          <ProfileForm key={data.provider?.updatedAt || 'new'} provider={data.provider} meta={meta} onSaved={reload} />
        </>
      )}
    </div>
  );
}

// Turn the saved profile (or nothing) into the values the form edits.
function initialForm(provider) {
  return {
    businessName: provider?.businessName || '',
    category: provider?.category || '',
    description: provider?.description || '',
    phone: provider?.phone || '',
    address: provider?.address || '',
    division: provider?.division || '',
    district: provider?.district || '',
    location: provider?.location?.lat ? provider.location : null,
    serviceAreas: provider ? provider.serviceAreas.map((area) => area.division) : [],
    capacity: provider?.capacity || { min: 0, max: 0 },
    allowsOutsideCatering: provider?.allowsOutsideCatering ?? true,
    setupBufferHours: provider?.setupBufferHours ?? 2,
    cleanupBufferHours: provider?.cleanupBufferHours ?? 2,
    tags: provider?.tags || [],
  };
}

function ProfileForm({ provider, meta, onSaved }) {
  const [form, setForm] = useState(() => initialForm(provider));
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = (changes) => setForm((current) => ({ ...current, ...changes }));
  // add the value to the list if missing, remove it if present
  const toggleInList = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const isVenue = form.category === 'venue';
  const servesGuests = form.category && form.category !== 'planner';

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      await providersApi.saveProfile({
        ...form,
        capacity: { min: Number(form.capacity.min) || 0, max: Number(form.capacity.max) || 0 },
      });
      setMessage({ tone: 'success', text: provider ? 'Profile saved.' : 'Profile created. Next: add packages and upload your documents.' });
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage({ tone: 'danger', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader title="Business" />
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Business name" required value={form.businessName} onChange={(e) => update({ businessName: e.target.value })} error={errors.businessName} />
          <Select
            label="Category"
            required
            value={form.category}
            placeholder="Choose category"
            options={meta.providerCategories.map((c) => ({ value: c, label: meta.providerCategoryLabels[c] }))}
            onChange={(e) => update({ category: e.target.value })}
            error={errors.category}
            hint={form.category ? `Required documents: ${meta.requiredCredentials[form.category].map((t) => meta.credentialLabels[t]).join(', ')}` : ''}
          />
          <Textarea label="Description" className="md:col-span-2" value={form.description} onChange={(e) => update({ description: e.target.value })} error={errors.description} />
          <Input label="Business phone" type="tel" value={form.phone} onChange={(e) => update({ phone: e.target.value })} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Location" subtitle="Click the map to place your business, then drag the pin to adjust." />
        <div className="space-y-4">
          <DivisionDistrictSelect meta={meta} division={form.division} district={form.district} onChange={update} errors={errors} />
          <Input label="Street address" value={form.address} onChange={(e) => update({ address: e.target.value })} error={errors.address} />
          <MapPicker
            value={form.location}
            onChange={(location) => update({ location })}
            center={meta.divisionCenters[form.division] || meta.divisionCenters.Dhaka}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>{form.location ? `Pin: ${form.location.lat}, ${form.location.lng}` : 'No pin yet: hosts will only see your district.'}</span>
            {form.location && (
              <button type="button" className="font-semibold text-danger hover:underline" onClick={() => update({ location: null })}>
                Remove pin
              </button>
            )}
          </div>
          {errors.location && <p className="text-xs text-danger">{errors.location}</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Service areas" subtitle="Divisions where you can deliver or host events." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.keys(meta.divisions).map((division) => (
            <Checkbox
              key={division}
              label={division}
              checked={form.serviceAreas.includes(division)}
              onChange={() => update({ serviceAreas: toggleInList(form.serviceAreas, division) })}
            />
          ))}
        </div>
        {errors.serviceAreas && <p className="mt-2 text-xs font-medium text-danger">{errors.serviceAreas}</p>}
      </Card>

      {servesGuests && (
        <Card>
          <CardHeader title={isVenue ? 'Capacity & venue rules' : 'Capacity'} subtitle="Guest numbers you can handle for one event." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Minimum guests"
              type="number"
              min="0"
              value={form.capacity.min}
              onChange={(e) => update({ capacity: { ...form.capacity, min: e.target.value } })}
              error={errors['capacity.min']}
            />
            <Input
              label="Maximum guests"
              type="number"
              min="0"
              required={isVenue}
              value={form.capacity.max}
              onChange={(e) => update({ capacity: { ...form.capacity, max: e.target.value } })}
              error={errors['capacity.max']}
            />
            {isVenue && (
              <>
                <Input
                  label="Setup time before an event (hours)"
                  type="number"
                  min="0"
                  max="12"
                  value={form.setupBufferHours}
                  onChange={(e) => update({ setupBufferHours: e.target.value })}
                  hint="The hall is blocked for this long before each booking."
                />
                <Input
                  label="Cleanup time after an event (hours)"
                  type="number"
                  min="0"
                  max="12"
                  value={form.cleanupBufferHours}
                  onChange={(e) => update({ cleanupBufferHours: e.target.value })}
                />
                <Checkbox
                  className="sm:col-span-2"
                  label="Outside caterers are allowed"
                  hint="Untick if guests must use your in-house catering."
                  checked={form.allowsOutsideCatering}
                  onChange={(e) => update({ allowsOutsideCatering: e.target.checked })}
                />
              </>
            )}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Services & preferences" subtitle="Hosts can filter providers by these." />
        <div className="flex flex-wrap gap-2">
          {meta.providerTags.map((tag) => {
            const on = form.tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => update({ tags: toggleInList(form.tags, tag) })}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  on ? 'border-primary bg-primary text-white' : 'border-line bg-card text-ink hover:border-primary'
                }`}
              >
                {meta.providerTagLabels[tag]}
              </button>
            );
          })}
        </div>
      </Card>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={busy} icon="check">
          {provider ? 'Save profile' : 'Create profile'}
        </Button>
      </div>
    </form>
  );
}
