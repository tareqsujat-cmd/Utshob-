import { Notification } from '../models/Notification.js';

// Create one in-app notification per user. If `dedupeKey` is given, the unique index on
// Notification.dedupeKey makes sure the same notification is never created twice.
// (Telegram delivery is added on top of this by the M2-C feature.)
export async function notifyUsers(userIds, { type, title, body = '', link = '', dedupeKey, relatedTask }) {
  const uniqueIds = [...new Set(userIds.filter(Boolean).map(String))];
  const created = [];

  for (const userId of uniqueIds) {
    try {
      const notification = await Notification.create({
        user: userId,
        type,
        title,
        body,
        link,
        relatedTask,
        dedupeKey: dedupeKey ? `${dedupeKey}:${userId}` : undefined,
      });
      created.push(notification);
    } catch (err) {
      if (err.code !== 11000) throw err; // 11000 = already notified, so skip silently
    }
  }
  return created;
}
