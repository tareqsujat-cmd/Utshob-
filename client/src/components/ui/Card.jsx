// White rounded panel used for almost every block of content.
export function Card({ className = '', padded = true, children }) {
  return (
    <div className={`rounded-2xl border border-line bg-card shadow-[0_1px_2px_rgba(28,43,45,0.05)] ${padded ? 'p-5 md:p-6' : ''} ${className}`}>
      {children}
    </div>
  );
}

// Title row at the top of a card, with optional subtitle and an action on the right.
export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
