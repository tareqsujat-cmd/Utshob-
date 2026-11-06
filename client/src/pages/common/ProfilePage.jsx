import { useState } from 'react';
import { api, fieldErrors } from '../../api/client.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useMeta } from '../../hooks/useMeta.js';
import { PageHeader, Alert } from '../../components/ui/Layout.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { DivisionDistrictSelect } from '../../components/DivisionDistrictSelect.jsx';
import { TelegramCard } from '../../components/TelegramCard.jsx';

export function ProfilePage() {
  const { user } = useAuth();
  const isCoordinator = Boolean(user.organization);

  return (
    <div>
      <PageHeader title="Your profile" subtitle="Keep your contact details up to date." />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileForm />
        <div className="space-y-6">
          <PasswordForm />
          {isCoordinator && <OrganizationForm />}
          <TelegramCard />{/* M2-C */}
        </div>
      </div>
    </div>
  );
}

function ProfileForm() {
  const { user, refresh } = useAuth();
  const meta = useMeta();
  const [form, setForm] = useState({
    name: user.name,
    phone: user.phone || '',
    division: user.division || '',
    district: user.district || '',
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const update = (changes) => setForm((current) => ({ ...current, ...changes }));

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setErrors({});
    try {
      await api.patch('/users/me', form);
      await refresh();
      setMessage({ tone: 'success', text: 'Profile saved.' });
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage({ tone: 'danger', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Details" subtitle={user.email} action={<StatusBadge status={user.approvalStatus} />} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Full name" required value={form.name} onChange={(e) => update({ name: e.target.value })} error={errors.name} />
        <Input label="Phone" type="tel" value={form.phone} onChange={(e) => update({ phone: e.target.value })} error={errors.phone} />
        <DivisionDistrictSelect meta={meta} division={form.division} district={form.district} onChange={update} errors={errors} />
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button type="submit" loading={busy} icon="check">
          Save details
        </Button>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setErrors({});
    try {
      await api.patch('/users/me/password', form);
      setForm({ currentPassword: '', newPassword: '' });
      setMessage({ tone: 'success', text: 'Password changed.' });
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage({ tone: 'danger', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Password" />
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
          value={form.currentPassword}
          onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
          error={errors.currentPassword}
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters"
          value={form.newPassword}
          onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          error={errors.newPassword}
        />
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button type="submit" variant="secondary" loading={busy}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

// Coordinators: details of the orphanage / outreach organization they registered.
function OrganizationForm() {
  const { user, refresh } = useAuth();
  const organization = user.organization; // populated by GET /auth/me
  const [form, setForm] = useState({
    address: organization.address || '',
    contactPhone: organization.contactPhone || '',
    defaultReceivingCapacity: organization.defaultReceivingCapacity ?? 0,
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.patch('/organizations/mine', form);
      await refresh();
      setMessage({ tone: 'success', text: 'Organization saved.' });
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage({ tone: 'danger', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={organization.name}
        subtitle={`${organization.type === 'orphanage' ? 'Orphanage' : 'Street outreach'} · ${organization.district}, ${organization.division}`}
        action={<StatusBadge status={organization.approvalStatus} />}
      />
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} error={errors.address} />
        <Input label="Contact phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
        <Input
          label="Receiving capacity (portions per delivery)"
          type="number"
          min="0"
          value={form.defaultReceivingCapacity}
          onChange={(e) => setForm({ ...form, defaultReceivingCapacity: e.target.value })}
          error={errors.defaultReceivingCapacity}
        />
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button type="submit" variant="secondary" loading={busy}>
          Save organization
        </Button>
      </form>
    </Card>
  );
}
