import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Input, Select } from '../../components/ui/Field.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { formatTaka } from '../../components/ui/format.js';

// M1-B: browse approved providers. (M2-B adds smart search by location, date, budget and guests.)
export function ProviderDirectoryPage() {
  const meta = useMeta();
  const [filters, setFilters] = useState({ category: '', division: '', q: '' });
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  const { data, loading, error, reload } = useFetch(`/providers?${params}`);
  const update = (changes) => setFilters((current) => ({ ...current, ...changes }));

  return (
    <div>
      <PageHeader title="Provider directory" subtitle="Venues, caterers, restaurants and planners approved by our administrators." />

      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Search by name" placeholder="e.g. Shapla" value={filters.q} onChange={(e) => update({ q: e.target.value })} />
          <Select
            label="Category"
            value={filters.category}
            placeholder="All categories"
            options={(meta?.providerCategories || []).map((c) => ({ value: c, label: meta.providerCategoryLabels[c] }))}
            onChange={(e) => update({ category: e.target.value })}
          />
          <Select
            label="Division"
            value={filters.division}
            placeholder="All divisions"
            options={Object.keys(meta?.divisions || {}).map((d) => ({ value: d, label: d }))}
            onChange={(e) => update({ division: e.target.value })}
          />
        </div>
      </Card>

      {loading && <LoadingState />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.providers.length === 0 && (
        <Card><EmptyState icon="search" title="No providers match" message="Try another division or category." /></Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data && meta && data.providers.map((p) => (
          <Link key={p._id} to={`/providers/${p._id}`} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <Badge tone="primary">{meta.providerCategoryLabels[p.category]}</Badge>
                {p.bookable ? (
                  <Badge tone="success"><Icon name="shield" size={12} /> Credentials reviewed</Badge>
                ) : (
                  <Badge tone="warning">Not bookable now</Badge>
                )}
              </div>
              <h2 className="mt-3 text-lg font-semibold group-hover:text-primary">{p.businessName}</h2>
              <p className="flex items-center gap-1 text-sm text-muted"><Icon name="mapPin" size={14} /> {p.district}, {p.division}</p>
              <div className="mt-4 flex items-end justify-between text-sm">
                <span>{p.priceFrom !== null ? <>from <strong>{formatTaka(p.priceFrom)}</strong></> : 'No packages yet'}</span>
                {p.capacity?.max > 0 && <span className="text-muted">up to {p.capacity.max} guests</span>}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
