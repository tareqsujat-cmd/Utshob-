import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch.js';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { formatDateTime } from '../../components/ui/format.js';

// Show any stored value in a readable way (dates, objects, empty values).
function showValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function AuditLogPage() {
  const [filters, setFilters] = useState({ entityType: '', action: '' });
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page) });
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.action) params.set('action', filters.action);
  const { data, loading, error, reload } = useFetch(`/admin/audit-logs?${params}`);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const setFilter = (changes) => {
    setFilters({ ...filters, ...changes });
    setPage(1);
  };

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Who changed what, when and why. Entries can never be edited." />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Entity type" placeholder="e.g. user, event, booking" value={filters.entityType} onChange={(e) => setFilter({ entityType: e.target.value.trim() })} />
          <Input label="Action" placeholder="e.g. user.approve" value={filters.action} onChange={(e) => setFilter({ action: e.target.value.trim() })} />
        </div>
      </Card>

      <Card padded={false}>
        {loading && <LoadingState />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && data.logs.length === 0 && <EmptyState icon="list" title="No entries" message="Nothing matches these filters." />}
        {data && data.logs.length > 0 && (
          <ul className="divide-y divide-line">
            {data.logs.map((log) => (
              <li key={log._id} className="px-5 py-4 md:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="primary">{log.action}</Badge>
                  <span className="text-sm font-medium">{log.actor?.name || 'System'}</span>
                  {log.actorRole && <span className="text-xs text-muted">({log.actorRole})</span>}
                  <span className="ml-auto text-xs text-muted">{formatDateTime(log.at)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {log.entityType} · {log.entityId}
                </p>
                {log.changes.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {log.changes.map((change, index) => (
                      <li key={index} className="break-words">
                        <span className="font-medium">{change.field}:</span>{' '}
                        <span className="text-danger line-through">{showValue(change.from)}</span> →{' '}
                        <span className="text-success">{showValue(change.to)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {log.reason && <p className="mt-2 text-sm italic text-muted">“{log.reason}”</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted">
            Page {page} of {totalPages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
