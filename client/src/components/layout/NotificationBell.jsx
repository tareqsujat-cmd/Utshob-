import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useFetch } from '../../hooks/useFetch.js';
import { Icon } from '../ui/Icon.jsx';
import { timeAgo } from '../ui/format.js';

// Bell icon with unread count. Opens a dropdown of the latest notifications.
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data, reload } = useFetch('/notifications');

  // Check for new notifications once a minute.
  useEffect(() => {
    const timer = setInterval(reload, 60_000);
    return () => clearInterval(timer);
  }, [reload]);

  const unread = data?.unreadCount || 0;
  const notifications = data?.notifications || [];

  async function openNotification(notification) {
    if (!notification.readAt) await api.patch(`/notifications/${notification._id}/read`).catch(() => {});
    setOpen(false);
    reload();
    if (notification.link) navigate(notification.link);
  }

  async function markAllRead() {
    await api.patch('/notifications/read-all').catch(() => {});
    reload();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) reload();
        }}
        className="relative rounded-lg p-2 text-muted hover:bg-primary-soft hover:text-primary"
        aria-label={`Notifications (${unread} unread)`}
      >
        <Icon name="bell" size={20} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* invisible layer: clicking anywhere outside closes the dropdown */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              {unread > 0 && (
                <button type="button" onClick={markAllRead} className="text-xs font-semibold text-primary hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {notifications.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">No notifications yet.</li>}
              {notifications.map((n) => (
                <li key={n._id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={`block w-full border-b border-line/60 px-4 py-3 text-left hover:bg-paper ${n.readAt ? '' : 'bg-accent-soft/40'}`}
                  >
                    <p className="text-sm font-semibold">{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-muted">{timeAgo(n.createdAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
