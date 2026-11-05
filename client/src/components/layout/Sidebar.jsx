import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useMeta } from '../../hooks/useMeta.js';
import { Icon } from '../ui/Icon.jsx';
import { Logo } from './Logo.jsx';
import { navSectionsFor } from './navItems.js';

// Left navigation. On desktop it is always visible; on mobile AppShell shows it as a drawer.
// onNavigate is called after a link is clicked (the drawer uses it to close itself).
export function Sidebar({ onNavigate, onClose }) {
  const { user } = useAuth();
  const meta = useMeta();
  const sections = navSectionsFor(user.role);

  return (
    <nav className="flex h-full flex-col bg-primary-dark text-white" aria-label="Main">
      <div className="flex items-center justify-between px-5 pb-6 pt-6">
        <Logo light />
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 md:hidden" aria-label="Close menu">
            <Icon name="x" size={20} />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-3">
        {sections.map(({ section, items }) => (
          <div key={section}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/45">{section}</p>
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive ? 'bg-white/12 text-white' : 'text-white/75 hover:bg-white/6 hover:text-white'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-accent" />}
                        <Icon name={item.icon} size={18} />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="m-3 rounded-xl bg-white/8 px-4 py-3">
        <p className="text-[11px] uppercase tracking-wider text-white/50">Signed in as</p>
        <p className="truncate text-sm font-semibold">{meta?.roleLabels?.[user.role] || user.role}</p>
      </div>
    </nav>
  );
}
