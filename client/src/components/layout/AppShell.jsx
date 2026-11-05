import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useMeta } from '../../hooks/useMeta.js';
import { Icon } from '../ui/Icon.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Sidebar } from './Sidebar.jsx';
import { NotificationBell } from './NotificationBell.jsx';
import { UserMenu } from './UserMenu.jsx';
import { LogoMark } from './Logo.jsx';

// The frame around every logged-in page: sidebar + top bar + the page itself (<Outlet />).
export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const meta = useMeta();
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar (md and wider) */}
      <aside className="hidden md:block md:w-64 md:shrink-0">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={closeDrawer} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">
            <Sidebar onNavigate={closeDrawer} onClose={closeDrawer} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur md:px-8">
          <button type="button" onClick={() => setDrawerOpen(true)} className="rounded-lg p-2 text-ink hover:bg-primary-soft md:hidden" aria-label="Open menu">
            <Icon name="menu" size={22} />
          </button>
          <div className="md:hidden">
            <LogoMark size={30} />
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {meta?.demoMode && (
              <Badge tone="accent" className="hidden sm:inline-flex">
                Demo data
              </Badge>
            )}
            <NotificationBell />
            <UserMenu />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
