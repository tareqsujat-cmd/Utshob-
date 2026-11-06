import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch.js';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { AuditEntry } from '../../components/AuditEntry.jsx';

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
          <Input label="Entity type" placeholder="e.g. user, event, budget, credential" value={filters.entityType} onChange={(e) => setFilter({ entityType: e.target.value.trim() })} />
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
                <AuditEntry log={log} showEntity />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-sm text-muted">Page {page} of {totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
