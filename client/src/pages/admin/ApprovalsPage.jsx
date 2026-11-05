import { useState } from 'react';
import { api } from '../../api/client.js';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { PageHeader, Alert } from '../../components/ui/Layout.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Select, Textarea } from '../../components/ui/Field.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { formatDate } from '../../components/ui/format.js';

export function ApprovalsPage() {
  const pending = useFetch('/admin/approvals');
  const [filters, setFilters] = useState({ role: '', status: '' });
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
  const allUsers = useFetch(`/admin/users?${query}`);
  const meta = useMeta();

  const [rejecting, setRejecting] = useState(null); // the user being rejected (opens the modal)
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  async function decide(user, status, note = '') {
    setBusyId(user._id);
    setError(null);
    try {
      await api.patch(`/admin/users/${user._id}/approval`, { status, note });
      setRejecting(null);
      pending.reload();
      allUsers.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Account approvals"
        subtitle="Providers and community organizations can only operate after an administrator approves them."
      />
      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <section className="mb-10">
        {pending.loading && <LoadingState />}
        {pending.error && <ErrorState error={pending.error} onRetry={pending.reload} />}
        {pending.data && pending.data.users.length === 0 && (
          <Card>
            <EmptyState icon="check" title="Nothing waiting" message="All accounts have been reviewed." />
          </Card>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {pending.data?.users.map((user) => (
            <Card key={user._id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{user.name}</p>
                  <p className="text-sm text-muted">{user.email}</p>
                </div>
                <Badge tone="primary">{meta?.roleLabels?.[user.role]}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted">Location</dt>
                <dd>{user.district}, {user.division}</dd>
                <dt className="text-muted">Phone</dt>
                <dd>{user.phone || '—'}</dd>
                <dt className="text-muted">Signed up</dt>
                <dd>{formatDate(user.createdAt)}</dd>
                {user.organization && (
                  <>
                    <dt className="text-muted">Organization</dt>
                    <dd>
                      {user.organization.name}
                      <span className="block text-xs text-muted">
                        {user.organization.type} · capacity {user.organization.defaultReceivingCapacity}
                      </span>
                    </dd>
                  </>
                )}
              </dl>
              <div className="mt-5 flex gap-2">
                <Button icon="check" loading={busyId === user._id} onClick={() => decide(user, 'approved')}>
                  Approve
                </Button>
                <Button variant="secondary" onClick={() => setRejecting(user)}>
                  Reject…
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader
          title="All accounts"
          action={
            <div className="flex flex-wrap gap-2">
              <Select
                aria-label="Filter by role"
                value={filters.role}
                onChange={(e) => setFilters({ ...filters, role: e.target.value })}
                placeholder="All roles"
                options={(meta?.roles || []).map((role) => ({ value: role, label: meta.roleLabels[role] }))}
              />
              <Select
                aria-label="Filter by status"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                placeholder="Any status"
                options={['pending', 'approved', 'rejected'].map((s) => ({ value: s, label: s }))}
              />
            </div>
          }
        />
        {allUsers.loading && <LoadingState />}
        {allUsers.error && <ErrorState error={allUsers.error} onRetry={allUsers.reload} />}
        {allUsers.data && (
          <div className="-mx-5 overflow-x-auto md:-mx-6">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2 font-semibold md:px-6">Name</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold">Location</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-5 py-2 font-semibold md:px-6">Joined</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.data.users.map((user) => (
                  <tr key={user._id} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-3 md:px-6">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted">{user.email}</p>
                    </td>
                    <td className="px-3 py-3">{meta?.roleLabels?.[user.role]}</td>
                    <td className="px-3 py-3">{user.district}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={user.approvalStatus} />
                    </td>
                    <td className="px-5 py-3 md:px-6">{formatDate(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allUsers.data.users.length === 0 && <p className="py-8 text-center text-sm text-muted">No accounts match these filters.</p>}
          </div>
        )}
      </Card>

      <RejectModal user={rejecting} busy={busyId === rejecting?._id} onClose={() => setRejecting(null)} onConfirm={(note) => decide(rejecting, 'rejected', note)} />
    </div>
  );
}

function RejectModal({ user, busy, onClose, onConfirm }) {
  const [note, setNote] = useState('');
  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title={`Reject ${user?.name || ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} disabled={!note.trim()} onClick={() => onConfirm(note)}>
            Reject account
          </Button>
        </>
      }
    >
      <Textarea
        label="Reason (sent to the applicant)"
        required
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Trade licence number could not be verified."
      />
    </Modal>
  );
}
