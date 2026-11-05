import { AuditLog } from '../models/AuditLog.js';

// Record who changed what, when and why. Call it after a successful change.
export function logAudit({ actor, action, entityType, entityId, changes = [], reason = '' }) {
  return AuditLog.create({
    actor: actor?._id,
    actorRole: actor?.role,
    action,
    entityType,
    entityId,
    changes,
    reason,
  });
}

// Compare the listed fields of two objects and return [{ field, from, to }] for those that differ.
// JSON.stringify lets us compare dates, arrays and nested objects in a simple way.
export function diffFields(before, after, fields) {
  const changes = [];
  for (const field of fields) {
    const from = before[field];
    const to = after[field];
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field, from, to });
  }
  return changes;
}
