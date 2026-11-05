import { Icon } from './Icon.jsx';

// Page title row: big serif heading, short description, buttons on the right.
export function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold leading-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted md:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const STAT_TONES = {
  primary: 'bg-primary-soft text-primary',
  accent: 'bg-accent-soft text-[#8a5a12]',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

// One number with a label, for dashboard rows: <StatTile label="Budget" value="৳150,000" icon="wallet" />
export function StatTile({ label, value, icon, tone = 'primary', hint }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-card p-4">
      {icon && (
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${STAT_TONES[tone]}`}>
          <Icon name={icon} size={22} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium leading-snug text-muted">{label}</p>
        <p className="font-display text-2xl font-semibold leading-tight">{value}</p>
        {hint && <p className="truncate text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

const ALERT_TONES = {
  info: ['bg-primary-soft border-primary/20 text-primary', 'info'],
  success: ['bg-success-soft border-success/20 text-success', 'check'],
  warning: ['bg-warning-soft border-warning/30 text-warning', 'alert'],
  danger: ['bg-danger-soft border-danger/20 text-danger', 'alert'],
};

// Coloured message box: <Alert tone="warning" title="Over budget">Food is ৳5,000 over.</Alert>
export function Alert({ tone = 'info', title, children, action }) {
  const [classes, icon] = ALERT_TONES[tone];
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 ${classes}`}>
      <Icon name={icon} size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-ink/80">{children}</div>}
      </div>
      {action}
    </div>
  );
}
