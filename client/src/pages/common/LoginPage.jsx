import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { Input } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Alert } from '../../components/ui/Layout.jsx';
import { AuthLayout } from './AuthLayout.jsx';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const meta = useMeta();
  const demo = useFetch('/meta/demo-accounts'); // seeded accounts, read from the database

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function doLogin(loginEmail, loginPassword) {
    setBusy(true);
    setError(null);
    try {
      await login(loginEmail, loginPassword);
      navigate(location.state?.from || '/', { replace: true }); // back to the page that asked for login
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    doLogin(email, password);
  }

  const demoAccounts = demo.data?.accounts || [];

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to plan, book and share.">
      {location.state?.message && (
        <div className="mb-4">
          <Alert tone="info">{location.state.message}</Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" loading={busy} className="w-full" size="lg">
          Log in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        New here?{' '}
        <Link to="/signup" className="font-semibold text-primary hover:underline">
          Create an account
        </Link>
      </p>

      {demoAccounts.length > 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-accent/60 bg-accent-soft/50 p-4">
          <p className="text-sm font-semibold">Demo accounts</p>
          <p className="mb-3 text-xs text-muted">
            Synthetic data. Password for all: <code className="font-semibold text-ink">{demo.data.password}</code>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {demoAccounts.map((account) => (
              <button
                key={account._id}
                type="button"
                disabled={busy}
                onClick={() => doLogin(account.email, demo.data.password)}
                className="rounded-lg border border-line bg-card px-3 py-2 text-left hover:border-primary disabled:opacity-60"
              >
                <span className="block text-xs font-semibold text-primary">
                  {meta?.roleLabels?.[account.role] || account.role}
                  {account.approvalStatus === 'pending' && ' (pending)'}
                </span>
                <span className="block truncate text-sm">{account.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
