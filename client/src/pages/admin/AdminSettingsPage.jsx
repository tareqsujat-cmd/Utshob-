import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { PageHeader, Alert } from '../../components/ui/Layout.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { LoadingState, ErrorState } from '../../components/ui/States.jsx';

export function AdminSettingsPage() {
  const meta = useMeta();
  const { data, loading, error, reload } = useFetch('/admin/settings');
  const [saving, setSaving] = useState(null);
  const [actionError, setActionError] = useState(null);

  async function toggle(setting) {
    setSaving(setting.key);
    setActionError(null);
    try {
      await api.patch(`/admin/settings/${setting.key}`, { value: !setting.value });
      reload();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <PageHeader title="Demo & settings" subtitle="Switches used during the demonstration." />
      {actionError && (
        <div className="mb-4">
          <Alert tone="danger">{actionError}</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Fault injection" subtitle="Make an external service fail on purpose to show the fallback." />
          {loading && <LoadingState />}
          {error && <ErrorState error={error} onRetry={reload} />}
          <ul className="space-y-4">
            {data?.settings.map((setting) => (
              <li key={setting.key} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">{setting.label}</p>
                  <p className="text-xs text-muted">{setting.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={setting.value}
                  aria-label={setting.label}
                  disabled={saving === setting.key}
                  onClick={() => toggle(setting)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${setting.value ? 'bg-danger' : 'bg-line'}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${setting.value ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {meta?.demoMode && <ResetDemoCard />}
      </div>
    </div>
  );
}

// Re-runs the seed script on the server. Everyone (including this admin) must log in again,
// because all accounts are recreated with new ids.
function ResetDemoCard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/admin/demo/reset');
      await logout();
      navigate('/login', { state: { message: 'Demo data was reset. Please log in again.' } });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Reset demo data" subtitle="Deletes every record and restores the original demo scenario." />
      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <Button variant="danger" icon="refresh" onClick={() => setOpen(true)}>
        Reset demo…
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Reset all demo data?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={reset}>
              Yes, reset everything
            </Button>
          </>
        }
      >
        <p className="text-sm">
          All events, bookings, donations and accounts are deleted and the seed data is inserted again. You will be logged out.
        </p>
      </Modal>
    </Card>
  );
}
