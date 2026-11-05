import { Icon } from './Icon.jsx';

// The three states every data page needs: loading, empty, error.

export function Spinner({ size = 20, className = '' }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size }}
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ icon = 'inbox', title, message, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
        <Icon name={icon} size={26} />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {message && <p className="mt-1 max-w-md text-sm text-muted">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger">
        <Icon name="alert" size={26} />
      </div>
      <h3 className="text-lg font-semibold">Something went wrong</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{error?.message || 'Please try again.'}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-line bg-card px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary"
        >
          <Icon name="refresh" size={16} /> Try again
        </button>
      )}
    </div>
  );
}
