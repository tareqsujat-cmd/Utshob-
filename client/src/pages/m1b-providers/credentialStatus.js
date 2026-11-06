import { daysUntil } from '../../components/ui/format.js';

// What a credential means right now, in words and colour (same logic as the server's isCredentialValid).
export function credentialState(credential) {
  if (credential.status === 'pending') return { label: 'Waiting for review', tone: 'warning' };
  if (credential.status === 'rejected') return { label: 'Rejected', tone: 'danger' };
  const days = daysUntil(credential.expiresAt);
  if (days <= 0) return { label: 'Expired', tone: 'danger' };
  if (days <= 30) return { label: `Approved · expires in ${days} days`, tone: 'warning' };
  return { label: 'Approved', tone: 'success' };
}
