import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Input, Select } from '../../components/ui/Field.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { QuantityBar, DeadlineLabel, MissingInfo } from './SurplusParts.jsx';

// M1-C: open surplus listings for coordinators (and admins). Expired ones are closed on the server.
export function SurplusBrowsePage() {
  const { user } = useAuth();
  const meta = useMeta();
  const [filters, setFilters] = useState({ division: user.division || '', q: '' });
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  const { data, loading, error, reload } = useFetch(`/surplus?${params}`);

  return (
    <div>
      <PageHeader eyebrow="Food" title="Available surplus" subtitle="Open listings, most urgent first. Use Food requests → Find matches for suggestions that fit your capacity." />
      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Division"
            value={filters.division}
            placeholder="All divisions"
            options={Object.keys(meta?.divisions || {}).map((d) => ({ value: d, label: d }))}
            onChange={(e) => setFilters({ ...filters, division: e.target.value })}
          />
          <Input label="Food" placeholder="e.g. khichuri" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </div>
      </Card>

      {loading && <LoadingState />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.listings.length === 0 && <Card><EmptyState icon="leaf" title="No open surplus right now" message="You will get a notification when food is shared in your division." /></Card>}
      <div className="grid gap-4 lg:grid-cols-2">
        {data?.listings.map((l) => (
          <Link key={l._id} to={`/surplus/${l._id}`} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <h2 className="text-lg font-semibold group-hover:text-primary">{l.foodType}</h2>
              <p className="flex items-center gap-1 text-sm text-muted"><Icon name="mapPin" size={14} /> {l.pickupLocation.address || l.pickupLocation.district}, {l.pickupLocation.division} · by {l.postedBy?.name}</p>
              <div className="mt-3"><QuantityBar listing={l} /></div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <DeadlineLabel deadline={l.pickupDeadline} />
                <MissingInfo missing={l.missingInfo} />
              </div>
              {l.allergens.length > 0 && <p className="mt-2 text-xs text-danger">Contains: {l.allergens.map((a) => meta?.allergenLabels[a]).join(', ')}</p>}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
