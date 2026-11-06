import { Link } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch.js';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { formatQty } from '../../components/ui/format.js';
import { QuantityBar, DeadlineLabel, MissingInfo } from './SurplusParts.jsx';

// M1-C: the surplus I have shared and who reserved it.
export function SurplusMinePage() {
  const { data, loading, error, reload } = useFetch('/surplus/mine');

  return (
    <div>
      <PageHeader
        eyebrow="Share food"
        title="My surplus"
        subtitle="Good food reaches good people. Expired listings close automatically."
        actions={<ButtonLink to="/surplus/new" icon="plus">Share surplus</ButtonLink>}
      />
      {loading && <LoadingState />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.listings.length === 0 && (
        <Card><EmptyState icon="leaf" title="Nothing shared yet" message="After an event, share untouched food with orphanages and outreach teams." action={<ButtonLink to="/surplus/new" icon="plus">Share surplus</ButtonLink>} /></Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {data?.listings.map((l) => (
          <Link key={l._id} to={`/surplus/${l._id}`} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold group-hover:text-primary">{l.foodType}</h2>
                  {l.event && <p className="text-xs text-muted">From {l.event.title}</p>}
                </div>
                <StatusBadge status={l.status} />
              </div>
              <div className="mt-3"><QuantityBar listing={l} /></div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <DeadlineLabel deadline={l.pickupDeadline} />
                <MissingInfo missing={l.missingInfo} />
              </div>
              {l.reservations.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                  {l.reservations.map((r) => (
                    <li key={r._id} className="flex justify-between gap-2">
                      <span>{r.organization.name}</span>
                      <span className="text-muted">{formatQty(r.quantityReserved)} {r.unit} · {r.status.replace('_', ' ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
