import { useOutletContext } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch.js';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { AuditEntry } from '../../components/AuditEntry.jsx';

// M1-A: requirement-change history (event and budget changes, with who, when and why).
export function EventHistoryTab() {
  const { event } = useOutletContext();
  const { data, loading, error, reload } = useFetch(`/events/${event._id}/history`);

  return (
    <Card padded={false}>
      <div className="px-5 pt-5 md:px-6">
        <CardHeader title="Change history" subtitle="Every change to requirements, budget, menu, food plan and invitation." />
      </div>
      {loading && <LoadingState />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.logs.length === 0 && <EmptyState icon="clock" title="No changes yet" />}
      {data && (
        <ol className="divide-y divide-line">
          {data.logs.map((log) => (
            <li key={log._id} className="px-5 py-4 md:px-6">
              <AuditEntry log={log} />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
