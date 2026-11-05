import { Notification } from '../models/Notification.js';
import { httpError } from '../utils/httpError.js';

// GET /api/notifications: my latest 50, plus how many are unread
export async function listMine(req, res) {
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50),
    Notification.countDocuments({ user: req.user._id, readAt: null }),
  ]);
  res.json({ notifications, unreadCount });
}

// PATCH /api/notifications/:id/read
// The filter includes `user`, so you can only mark your own notifications.
export async function markRead(req, res) {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { readAt: new Date() },
    { returnDocument: 'after' }
  );
  if (!notification) throw httpError(404, 'Notification not found');
  res.json({ notification });
}

// PATCH /api/notifications/read-all
export async function markAllRead(req, res) {
  await Notification.updateMany({ user: req.user._id, readAt: null }, { readAt: new Date() });
  res.json({ ok: true });
}
