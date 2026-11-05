import { Logo } from '../../components/layout/Logo.jsx';
import { Icon } from '../../components/ui/Icon.jsx';

const POINTS = [
  { icon: 'wallet', text: 'Plan budgets, menus and guest lists that adapt when plans change.' },
  { icon: 'store', text: 'Compare credential-reviewed venues, caterers and planners.' },
  { icon: 'heart', text: 'Send good leftover food to orphanages and street outreach teams.' },
];

// Split screen used by the login and signup pages: brand panel on the left (large screens), form on the right.
export function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-primary-dark p-12 text-white lg:flex lg:flex-col">
        <Logo light />
        {/* decorative rings, like plates laid on a festival table */}
        <svg className="pointer-events-none absolute -bottom-40 -right-40 h-[560px] w-[560px] opacity-20" viewBox="0 0 200 200" aria-hidden="true">
          {[90, 72, 54, 36].map((r) => (
            <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#E39B2D" strokeWidth="1.2" />
          ))}
        </svg>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl font-semibold leading-tight">
            Plan generous events.
            <br />
            <span className="text-accent">Share what&rsquo;s left.</span>
          </h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map((point) => (
              <li key={point.icon} className="flex gap-3 text-white/85">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10">
                  <Icon name={point.icon} size={18} />
                </span>
                <span className="pt-1.5 text-sm">{point.text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-10 text-xs text-white/50">Across all eight divisions of Bangladesh.</p>
        </div>
      </aside>

      <main className="flex items-start justify-center px-4 py-10 sm:items-center sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-3xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
