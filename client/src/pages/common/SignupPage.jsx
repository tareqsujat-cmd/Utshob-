import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useMeta } from '../../hooks/useMeta.js';
import { fieldErrors } from '../../api/client.js';
import { Input } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Alert } from '../../components/ui/Layout.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { DivisionDistrictSelect } from '../../components/DivisionDistrictSelect.jsx';
import { AuthLayout } from './AuthLayout.jsx';

// Short explanation shown on each role card (interface text, not data).
const ROLE_INFO = {
  host: { icon: 'calendar', text: 'Plan events, budgets and bookings.' },
  provider: { icon: 'store', text: 'Venue, caterer, restaurant or planner.' },
  orphanage_coordinator: { icon: 'home', text: 'Request and confirm food for an orphanage.' },
  outreach_coordinator: { icon: 'users', text: 'Distribute food through street outreach.' },
  volunteer: { icon: 'truck', text: 'Collect and deliver surplus food.' },
};

const EMPTY_FORM = {
  role: '',
  name: '',
  email: '',
  password: '',
  phone: '',
  division: '',
  district: '',
  organizationName: '',
  organizationAddress: '',
  receivingCapacity: '',
};

export function SignupPage() {
  const { signup } = useAuth();
  const meta = useMeta();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const isCoordinator = form.role === 'orphanage_coordinator' || form.role === 'outreach_coordinator';
  const needsApproval = form.role === 'provider' || isCoordinator;

  // update one or more fields: update({ name: 'Rina' })
  const update = (changes) => setForm((current) => ({ ...current, ...changes }));

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    const payload = { ...form };
    if (!isCoordinator) {
      delete payload.organizationName;
      delete payload.organizationAddress;
      delete payload.receivingCapacity;
    } else if (payload.receivingCapacity === '') {
      delete payload.receivingCapacity;
    }
    try {
      await signup(payload);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setErrors(fieldErrors(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Choose how you will use Utshob.">
      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">I am a…</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(meta?.signupRoles || []).map((role) => (
              <label
                key={role}
                className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                  form.role === role ? 'border-primary bg-primary-soft' : 'border-line bg-card hover:border-primary/50'
                }`}
              >
                <input type="radio" name="role" value={role} checked={form.role === role} onChange={() => update({ role })} className="sr-only" />
                <Icon name={ROLE_INFO[role]?.icon} size={20} className="mt-0.5 shrink-0 text-primary" />
                <span>
                  <span className="block text-sm font-semibold">{meta.roleLabels[role]}</span>
                  <span className="block text-xs text-muted">{ROLE_INFO[role]?.text}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.role && <p className="mt-1 text-xs font-medium text-danger">{errors.role}</p>}
        </fieldset>

        {form.role && (
          <>
            {needsApproval && (
              <Alert tone="info">An administrator reviews this type of account before you can use its features.</Alert>
            )}
            <Input label="Full name" required value={form.name} onChange={(e) => update({ name: e.target.value })} error={errors.name} />
            <Input label="Email" type="email" required autoComplete="email" value={form.email} onChange={(e) => update({ email: e.target.value })} error={errors.email} />
            <Input
              label="Password"
              type="password"
              required
              autoComplete="new-password"
              hint="At least 8 characters"
              value={form.password}
              onChange={(e) => update({ password: e.target.value })}
              error={errors.password}
            />
            <Input label="Phone" type="tel" placeholder="01XXXXXXXXX" value={form.phone} onChange={(e) => update({ phone: e.target.value })} error={errors.phone} />
            <DivisionDistrictSelect meta={meta} division={form.division} district={form.district} onChange={update} errors={errors} />

            {isCoordinator && (
              <div className="space-y-4 rounded-xl border border-line bg-paper p-4">
                <p className="text-sm font-semibold">Your organization</p>
                <Input
                  label="Organization name"
                  required
                  value={form.organizationName}
                  onChange={(e) => update({ organizationName: e.target.value })}
                  error={errors.organizationName}
                />
                <Input label="Address" value={form.organizationAddress} onChange={(e) => update({ organizationAddress: e.target.value })} />
                <Input
                  label="Receiving capacity (portions per delivery)"
                  type="number"
                  min="0"
                  value={form.receivingCapacity}
                  onChange={(e) => update({ receivingCapacity: e.target.value })}
                  error={errors.receivingCapacity}
                />
              </div>
            )}

            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" loading={busy} className="w-full" size="lg">
              Create account
            </Button>
          </>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
