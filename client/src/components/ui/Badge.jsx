const TONES = {
  neutral: 'bg-paper text-muted border-line',
  primary: 'bg-primary-soft text-primary border-primary/20',
  accent: 'bg-accent-soft text-[#8a5a12] border-accent/30',
  success: 'bg-success-soft text-success border-success/20',
  warning: 'bg-warning-soft text-warning border-warning/30',
  danger: 'bg-danger-soft text-danger border-danger/20',
};

// Small status pill: <Badge tone="success">Approved</Badge>
export function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

// Maps common status words to a colour, so every page shows statuses the same way.
const STATUS_TONES = {
  approved: 'success',
  confirmed: 'success',
  completed: 'success',
  received: 'success',
  paid: 'success',
  active: 'success',
  fulfilled: 'success',
  collected: 'success',
  pending: 'warning',
  started: 'warning',
  fully_reserved: 'accent',
  draft: 'neutral',
  planned: 'primary',
  open: 'primary',
  reserved: 'primary',
  partially_matched: 'primary',
  partially_received: 'accent',
  partially_collected: 'accent',
  collection_assigned: 'primary',
  assigned: 'primary',
  en_route: 'primary',
  delayed: 'warning',
  missed: 'danger',
  sent: 'success',
  pledged: 'neutral',
  rejected: 'danger',
  cancelled: 'danger',
  failed: 'danger',
  expired: 'neutral',
};

export function StatusBadge({ status }) {
  const label = String(status || '').replaceAll('_', ' ');
  return <Badge tone={STATUS_TONES[status] || 'neutral'} className="capitalize">{label}</Badge>;
}
