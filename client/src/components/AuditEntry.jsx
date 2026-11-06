import { Badge } from './ui/Badge.jsx';
import { formatDateTime } from './ui/format.js';

// Show any stored value in a readable way (dates, objects, empty values).
function showValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// One audit-log entry: who did what, when, what changed (from -> to) and why.
// Used by the admin audit log and the event history tab.
export function AuditEntry({ log, showEntity = false }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">{log.action}</Badge>
        <span className="text-sm font-medium">{log.actor?.name || 'System'}</span>
        {log.actorRole && <span className="text-xs text-muted">({log.actorRole})</span>}
        <span className="ml-auto text-xs text-muted">{formatDateTime(log.at)}</span>
      </div>
      {showEntity && (
        <p className="mt-1 text-xs text-muted">
          {log.entityType} · {log.entityId}
        </p>
      )}
      {log.changes?.length > 0 && (
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
    </div>
  );
}
