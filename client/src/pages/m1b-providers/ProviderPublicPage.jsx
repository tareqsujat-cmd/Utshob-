import { useParams } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { LoadingState, ErrorState } from '../../components/ui/States.jsx';
import { formatDate, formatPackagePrice } from '../../components/ui/format.js';
import { MapPicker } from '../../components/MapPicker.jsx';
import { BookabilityPanel } from './BookabilityPanel.jsx';

// M1-B: what hosts see about a provider, including exactly which credentials were reviewed.
export function ProviderPublicPage() {
  const { id } = useParams();
  const meta = useMeta();
  const { data, loading, error, reload } = useFetch(`/providers/${id}`);

  if (loading || !meta) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { provider, bookability, reviewedCredentials } = data;
  const upcomingBlocked = provider.blockedDates.filter((d) => new Date(d) >= new Date());

  return (
    <div>
      <PageHeader
        eyebrow={meta.providerCategoryLabels[provider.category]}
        title={provider.businessName}
        subtitle={provider.description}
      />
      <div className="mb-6">
        <BookabilityPanel bookability={bookability} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Packages" subtitle="Prices are the provider's list prices. Request a quote for your event." />
            {provider.packages.length === 0 && <p className="text-sm text-muted">No packages published yet.</p>}
            <ul className="divide-y divide-line">
              {provider.packages.map((pkg) => (
                <li key={pkg._id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{pkg.name}</p>
                    <p className="font-display text-lg font-semibold text-primary">{formatPackagePrice(pkg)}</p>
                  </div>
                  <p className="text-sm text-muted">{pkg.minGuests}–{pkg.maxGuests} guests{pkg.description && ` · ${pkg.description}`}</p>
                  {pkg.items.length > 0 && <p className="mt-1 text-sm">{pkg.items.join(' · ')}</p>}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Reviewed credentials" />
            {reviewedCredentials.length === 0 && <p className="text-sm text-muted">No documents have been reviewed yet.</p>}
            <ul className="space-y-3">
              {reviewedCredentials.map((c) => (
                <li key={c.type} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
                  <Icon name="shield" size={20} className={c.valid ? 'text-success' : 'text-danger'} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{c.label} <span className="font-normal text-muted">({c.number})</span></p>
                    <p className="text-xs text-muted">Reviewed by an administrator on {formatDate(c.reviewedAt)} · valid until {formatDate(c.expiresAt)}</p>
                  </div>
                  <Badge tone={c.valid ? 'success' : 'danger'}>{c.valid ? 'Valid' : 'Expired'}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-lg bg-paper px-3 py-2 text-xs text-muted">
              <strong>Please note:</strong> UTSHOB checks that the documents above exist and match the business. This is not a
              guarantee of food quality, hygiene or service.
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="space-y-3 text-sm">
              <div><dt className="text-xs text-muted">Address</dt><dd>{provider.address && <span className="block">{provider.address}</span>}<span className="text-muted">{provider.district} district, {provider.division} division</span></dd></div>
              <div><dt className="text-xs text-muted">Serves</dt><dd>{provider.serviceAreas.map((a) => a.division).join(', ')}</dd></div>
              {provider.capacity?.max > 0 && (
                <div><dt className="text-xs text-muted">Capacity</dt><dd>{provider.capacity.min}–{provider.capacity.max} guests</dd></div>
              )}
              {provider.category === 'venue' && (
                <>
                  <div>
                    <dt className="text-xs text-muted">Outside catering</dt>
                    <dd>{provider.allowsOutsideCatering ? 'Allowed' : 'Not allowed: in-house catering only'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Setup / cleanup time</dt>
                    <dd>{provider.setupBufferHours} h before · {provider.cleanupBufferHours} h after each event</dd>
                  </div>
                </>
              )}
            </dl>
            {provider.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {provider.tags.map((tag) => <Badge key={tag}>{meta.providerTagLabels[tag]}</Badge>)}
              </div>
            )}
          </Card>

          {provider.location?.lat && (
            <MapPicker readOnly value={provider.location} center={provider.location} height={220} />
          )}

          <Card>
            <CardHeader title="Unavailable dates" />
            {upcomingBlocked.length === 0 ? (
              <p className="text-sm text-muted">No blocked dates.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {upcomingBlocked.map((d) => <li key={d}><Badge tone="warning">{formatDate(d)}</Badge></li>)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
