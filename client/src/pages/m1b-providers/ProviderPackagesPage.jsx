import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch.js';
import { fieldErrors } from '../../api/client.js';
import { providersApi } from '../../api/m1b.providers.api.js';
import { PageHeader, Alert } from '../../components/ui/Layout.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Input, Select, Textarea, Checkbox } from '../../components/ui/Field.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { formatPackagePrice } from '../../components/ui/format.js';

// M1-B: packages and prices. Packages are archived, never deleted (old quotes may refer to them).
export function ProviderPackagesPage() {
  const { data, loading, error, reload } = useFetch('/providers/me');
  const [editing, setEditing] = useState(null); // null = closed, {} = new package, {...pkg} = edit
  const [showArchived, setShowArchived] = useState(false);
  const [actionError, setActionError] = useState(null);

  const provider = data?.provider;
  const packages = (provider?.packages || []).filter((p) => showArchived || !p.isArchived);

  async function toggleArchive(pkg) {
    setActionError(null);
    try {
      await providersApi.updatePackage(pkg._id, { ...packageBody(pkg), isArchived: !pkg.isArchived });
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="My business"
        title="Packages & prices"
        subtitle="What you offer and what it costs. Hosts compare these when they look for providers."
        actions={provider && <Button icon="plus" onClick={() => setEditing({})}>Add package</Button>}
      />
      {loading && <LoadingState />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && !provider && (
        <Card>
          <EmptyState icon="store" title="Create your business profile first" action={<ButtonLink to="/provider/profile">Create profile</ButtonLink>} />
        </Card>
      )}

      {provider && (
        <>
          {actionError && <div className="mb-4"><Alert tone="danger">{actionError}</Alert></div>}
          <Checkbox className="mb-4" label="Show archived packages" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {packages.length === 0 && (
            <Card>
              <EmptyState icon="file" title="No packages yet" message="Add at least one package so hosts can see your prices." action={<Button icon="plus" onClick={() => setEditing({})}>Add package</Button>} />
            </Card>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {packages.map((pkg) => (
              <Card key={pkg._id} className={pkg.isArchived ? 'opacity-60' : ''}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{pkg.name}</h2>
                    <p className="font-display text-xl font-semibold text-primary">{formatPackagePrice(pkg)}</p>
                  </div>
                  {pkg.isArchived && <Badge>Archived</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted">{pkg.minGuests}–{pkg.maxGuests} guests</p>
                {pkg.description && <p className="mt-2 text-sm">{pkg.description}</p>}
                {pkg.items.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {pkg.items.map((item) => (
                      <li key={item} className="rounded-md bg-paper px-2 py-0.5 text-xs">{item}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(pkg)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleArchive(pkg)}>{pkg.isArchived ? 'Restore' : 'Archive'}</Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {editing && <PackageModal pkg={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

// Only the fields the API accepts (drops _id etc.)
function packageBody(pkg) {
  return {
    name: pkg.name,
    description: pkg.description,
    pricingType: pkg.pricingType,
    price: Number(pkg.price),
    minGuests: Number(pkg.minGuests),
    maxGuests: Number(pkg.maxGuests),
    items: pkg.items,
    isArchived: pkg.isArchived,
  };
}

function PackageModal({ pkg, onClose, onSaved }) {
  const isNew = !pkg._id;
  const [form, setForm] = useState({
    name: pkg.name || '',
    description: pkg.description || '',
    pricingType: pkg.pricingType || 'per_guest',
    price: pkg.price ?? '',
    minGuests: pkg.minGuests ?? 1,
    maxGuests: pkg.maxGuests ?? '',
    itemsText: (pkg.items || []).join('\n'), // one included item per line
    isArchived: pkg.isArchived || false,
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const update = (changes) => setForm((current) => ({ ...current, ...changes }));

  async function save() {
    setBusy(true);
    setErrors({});
    setError(null);
    const body = packageBody({ ...form, items: form.itemsText.split('\n').map((s) => s.trim()).filter(Boolean) });
    try {
      if (isNew) await providersApi.addPackage(body);
      else await providersApi.updatePackage(pkg._id, body);
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add package' : `Edit ${pkg.name}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save} icon="check">Save package</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Package name" required className="sm:col-span-2" value={form.name} onChange={(e) => update({ name: e.target.value })} error={errors.name} />
        <Select
          label="Pricing"
          value={form.pricingType}
          options={[{ value: 'per_guest', label: 'Per guest' }, { value: 'flat', label: 'Flat price' }]}
          onChange={(e) => update({ pricingType: e.target.value })}
        />
        <Input label="Price (৳)" type="number" min="0" required value={form.price} onChange={(e) => update({ price: e.target.value })} error={errors.price} />
        <Input label="Minimum guests" type="number" min="1" value={form.minGuests} onChange={(e) => update({ minGuests: e.target.value })} error={errors.minGuests} />
        <Input label="Maximum guests" type="number" min="1" required value={form.maxGuests} onChange={(e) => update({ maxGuests: e.target.value })} error={errors.maxGuests} />
        <Textarea label="Description" className="sm:col-span-2" value={form.description} onChange={(e) => update({ description: e.target.value })} />
        <Textarea
          label="What's included"
          hint="One item per line"
          rows={4}
          className="sm:col-span-2"
          value={form.itemsText}
          onChange={(e) => update({ itemsText: e.target.value })}
        />
      </div>
      {error && <div className="mt-4"><Alert tone="danger">{error}</Alert></div>}
    </Modal>
  );
}
