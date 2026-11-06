import { formatDateTime } from '../../components/ui/format.js';

// The invitation designs: colours for each palette key stored on the event (theme.palette).
const PALETTES = {
  marigold: { background: '#fbefd9', accent: '#d9881a', text: '#3b2a12', soft: '#f5dfb5' },
  teal: { background: '#e3f1ef', accent: '#0e5e5a', text: '#0a3b38', soft: '#c6e3df' },
  rose: { background: '#fbe7ea', accent: '#b8435e', text: '#4a1a26', soft: '#f3c9d1' },
  night: { background: '#1c2b2d', accent: '#e39b2d', text: '#fbf8f3', soft: '#2c4144' },
};

// Draws an invitation. Used by the editor preview (host) and the public page (guests).
// `details`: { title, startsAt, location, hostName }   `invitation`: { heading, message, theme }
export function InvitationCard({ details, invitation }) {
  const colors = PALETTES[invitation.theme?.palette] || PALETTES.marigold;
  const fontClass = invitation.theme?.font === 'modern' ? 'font-sans' : 'font-display';
  const banner = invitation.theme?.layout === 'banner';
  const where = [details.location?.address, details.location?.district, details.location?.division].filter(Boolean).join(', ');

  return (
    <div className="overflow-hidden rounded-2xl shadow-sm" style={{ background: colors.background, color: colors.text }}>
      {banner && (
        <div className="px-6 py-8 sm:px-10" style={{ background: colors.accent, color: '#fff' }}>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] opacity-80">You are invited</p>
          <h2 className={`mt-2 text-3xl font-semibold ${fontClass}`}>{details.title}</h2>
        </div>
      )}
      <div className={`px-6 py-10 sm:px-10 ${banner ? 'text-left' : 'text-center'}`}>
        {!banner && (
          <>
            {/* a small hand-drawn ornament: a marigold-like flower */}
            <svg className="mx-auto mb-4" width="44" height="44" viewBox="0 0 40 40" aria-hidden="true">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <ellipse key={a} cx="20" cy="11" rx="4" ry="8" fill={colors.accent} opacity="0.85" transform={`rotate(${a} 20 20)`} />
              ))}
              <circle cx="20" cy="20" r="5" fill={colors.soft} />
            </svg>
            <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: colors.accent }}>You are invited</p>
            <h2 className={`mt-2 text-3xl font-semibold ${fontClass}`}>{details.title}</h2>
          </>
        )}
        {invitation.heading && <p className={`mt-4 text-xl ${fontClass}`}>{invitation.heading}</p>}
        {invitation.message && <p className="mx-auto mt-4 max-w-md whitespace-pre-line text-sm leading-relaxed opacity-90">{invitation.message}</p>}
        <div className={`mt-8 inline-block rounded-xl px-5 py-3 text-sm ${banner ? '' : 'mx-auto'}`} style={{ background: colors.soft }}>
          <p className="font-semibold">{formatDateTime(details.startsAt)}</p>
          {where && <p className="opacity-80">{where}</p>}
        </div>
        {details.hostName && <p className="mt-6 text-sm opacity-80">With love, {details.hostName}</p>}
      </div>
    </div>
  );
}
