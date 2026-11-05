import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useMeta } from '../../hooks/useMeta.js';
import { Icon } from '../ui/Icon.jsx';

// "NR" for "Nusrat Rahman"
function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const meta = useMeta();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    setOpen(false);
    await logout();
    navigate('/login');
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-primary-soft">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-semibold text-white">{initials(user.name)}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[140px] truncate text-sm font-semibold">{user.name}</span>
          <span className="block text-xs text-muted">{meta?.roleLabels?.[user.role]}</span>
        </span>
        <Icon name="chevronDown" size={16} className="text-muted" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-lg">
            <div className="border-b border-line px-4 py-3">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-paper">
              <Icon name="user" size={16} /> Profile
            </Link>
            <button type="button" onClick={handleLogout} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-danger hover:bg-paper">
              <Icon name="logout" size={16} /> Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
