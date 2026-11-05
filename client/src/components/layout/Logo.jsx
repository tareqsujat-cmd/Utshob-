// Brand mark: a plate seen from above with a marigold at its centre ("share the table").
export function LogoMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="#E39B2D" />
      <circle cx="20" cy="20" r="14" fill="none" stroke="#FBF8F3" strokeWidth="2" />
      <circle cx="20" cy="20" r="9" fill="#FBF8F3" opacity="0.18" />
      {/* six petals */}
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <ellipse key={angle} cx="20" cy="15.5" rx="2.4" ry="4" fill="#FBF8F3" transform={`rotate(${angle} 20 20)`} />
      ))}
      <circle cx="20" cy="20" r="2.6" fill="#0E5E5A" />
    </svg>
  );
}

export function Logo({ light = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <p className={`font-display text-xl font-semibold ${light ? 'text-white' : 'text-ink'}`}>Utshob</p>
        <p className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${light ? 'text-white/60' : 'text-muted'}`}>
          Share the table
        </p>
      </div>
    </div>
  );
}
