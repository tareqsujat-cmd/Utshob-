import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { sendMessage } from './telegram.service.js';

// Create one in-app notification per user. If `dedupeKey` is given, the unique index on
// Notification.dedupeKey makes sure the same notification is never created twice.
// telegram: true -> ALSO try to send it on Telegram to users who connected Telegram (M2-C).
// The in-app notification always exists first, so the dashboard works even if Telegram fails.
export async function notifyUsers(userIds, { type, title, body = '', link = '', dedupeKey, relatedTask, telegram = false }) {
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

  if (telegram) {
    for (const notification of created) {
      const user = await User.findById(notification.user).select('telegram');
      if (!user?.telegram?.chatId) continue; // not connected: stays "skipped", the dashboard still shows it
      await Notification.updateOne({ _id: notification._id }, { 'telegram.status': 'pending' });
      await deliverTelegram(notification._id);
    }
  }
  return created;
}

// Try to send one notification on Telegram, and record the outcome on the notification itself.
// Used for the first attempt AND for "Retry": it re-sends this same notification,
// so a retry can never create a second task or a second notification.
export async function deliverTelegram(notificationId) {
  // Claim it: only a pending or failed delivery can start. Two retries at once -> only one sends.
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, 'telegram.status': { $in: ['pending', 'failed'] } },
    { $set: { 'telegram.status': 'sending', 'telegram.lastAttemptAt': new Date() }, $inc: { 'telegram.attempts': 1 } },
    { returnDocument: 'after' }
  );
  if (!notification) return Notification.findById(notificationId); // already sent, sending, or not for Telegram

  const user = await User.findById(notification.user).select('telegram');
  const text = [notification.title, notification.body, notification.link && `${env.clientOrigin}${notification.link}`].filter(Boolean).join('\n');
  try {
    if (!user?.telegram?.chatId) throw new Error('User has disconnected Telegram');
    await sendMessage(user.telegram.chatId, text);
    await Notification.updateOne({ _id: notificationId }, { 'telegram.status': 'sent', 'telegram.sentAt': new Date(), 'telegram.lastError': '' });
  } catch (err) {
    console.error('Telegram delivery failed:', err.message); // logged; visible with a Retry button
    await Notification.updateOne({ _id: notificationId }, { 'telegram.status': 'failed', 'telegram.lastError': err.message });
  }
  return Notification.findById(notificationId);
}
