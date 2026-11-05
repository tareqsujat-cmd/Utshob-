import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { LoadingState, EmptyState } from '../ui/States.jsx';
import { ButtonLink } from '../ui/Button.jsx';

// Wrappers used in App.jsx to protect pages. The backend checks permissions too;
// these only decide what the browser shows.

// Logged-in users only. Others go to /login (and come back here after logging in).
export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState label="Loading your account…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

// Login/signup pages: already logged-in users go to the dashboard.
export function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

// Only some roles may open a page: <RequireRole roles={['admin']}>…</RequireRole>
export function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user.role)) {
    return (
      <EmptyState
        icon="lock"
        title="This page is not available for your role"
        message="If you think this is a mistake, contact an administrator."
        action={<ButtonLink to="/">Back to overview</ButtonLink>}
      />
    );
  }
  return children;
}
