import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { openFile } from '../../api/client.js';
import { providersApi } from '../../api/m1b.providers.api.js';
import { PageHeader, Alert } from '../../components/ui/Layout.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Textarea } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { formatDate } from '../../components/ui/format.js';
import { credentialState } from './credentialStatus.js';

const TABS = ['pending', 'approved', 'rejected'];

// M1-B (admin): review provider documents before the provider may accept bookings.
export function AdminCredentialsPage() {
  const meta = useMeta();
  const [tab, setTab] = useState('pending');
  const { data, loading, error, reload } = useFetch(`/admin/credentials?status=${tab}`);
  const [rejecting, setRejecting] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  async function review(credential, status, note = '') {
    setBusyId(credential._id);
    setMessage(null);
    try {
      await providersApi.reviewCredential(credential._id, status, note);
      setRejecting(null);
      reload();
    } catch (err) {
      setMessage({ tone: 'danger', text: err.message });
    } finally {
      setBusyId(null);
    }
  }

  async function expiryCheck() {
    setMessage(null);
    try {
      const result = await providersApi.runExpiryCheck();
      setMessage({ tone: 'info', text: `Expiry check done: ${result.expiredFound} newly expired document(s) found and their providers notified.` });
    } catch (err) {
      setMessage({ tone: 'danger', text: err.message });
    }
  }

  return (
    <div>
      <PageHeader
        title="Credential reviews"
        subtitle="Check each document against the provider's details. Approval means the document was reviewed, not that food quality is guaranteed."
        actions={<Button variant="secondary" icon="refresh" onClick={expiryCheck}>Run expiry check</Button>}
      />

      <div className="mb-4 flex gap-1 rounded-xl border border-line bg-card p-1 sm:inline-flex" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold capitalize ${tab === t ? 'bg-primary text-white' : 'text-muted hover:text-ink'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {message && <div className="mb-4"><Alert tone={message.tone}>{message.text}</Alert></div>}
      {(loading || !meta) && <LoadingState />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && meta && data.credentials.length === 0 && (
        <Card><EmptyState icon="check" title={`No ${tab} credentials`} /></Card>
      )}

      <div className="space-y-4">
        {data && meta && data.credentials.map((c) => {
          const state = credentialState(c);
          return (
            <Card key={c._id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link to={`/providers/${c.provider._id}`} className="font-semibold text-primary hover:underline">{c.provider.businessName}</Link>
                  <p className="text-sm text-muted">
                    {meta.providerCategoryLabels[c.provider.category]} · {c.provider.district}, {c.provider.division} · owner {c.provider.user.name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Account</span>
                  <StatusBadge status={c.provider.user.approvalStatus} />
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-muted">Document</dt><dd className="font-medium">{meta.credentialLabels[c.type]}</dd></div>
                <div><dt className="text-xs text-muted">Number</dt><dd className="font-medium">{c.number}</dd></div>
                <div><dt className="text-xs text-muted">Expires</dt><dd className="font-medium">{formatDate(c.expiresAt)}</dd></div>
                <div><dt className="text-xs text-muted">Uploaded</dt><dd className="font-medium">{formatDate(c.createdAt)}</dd></div>
              </dl>
              {tab !== 'pending' && (
                <p className="mt-3 text-sm text-muted">
                  <Badge tone={state.tone}>{state.label}</Badge> Reviewed by {c.reviewedBy?.name || 'an administrator'} on {formatDate(c.reviewedAt)}
                  {c.reviewNote && ` · “${c.reviewNote}”`}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon="file" onClick={() => openFile(c.file._id).catch((err) => setMessage({ tone: 'danger', text: err.message }))}>
                  Open {c.file.filename}
                </Button>
                {tab === 'pending' && (
                  <>
                    <Button size="sm" icon="check" loading={busyId === c._id} onClick={() => review(c, 'approved')}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRejecting(c)}>Reject…</Button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <RejectModal credential={rejecting} busy={busyId === rejecting?._id} onClose={() => setRejecting(null)} onConfirm={(note) => review(rejecting, 'rejected', note)} />
    </div>
  );
}

function RejectModal({ credential, busy, onClose, onConfirm }) {
  const [note, setNote] = useState('');
  return (
    <Modal
      open={Boolean(credential)}
      onClose={onClose}
      title="Reject document"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={busy} disabled={!note.trim()} onClick={() => onConfirm(note)}>Reject</Button>
        </>
      }
    >
      <Textarea label="Reason (sent to the provider)" required value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The licence number does not match the scan." />
    </Modal>
  );
}
