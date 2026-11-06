import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { isConfigured, recentMessages, sendMessage } from '../services/telegram.service.js';
import { logAudit } from '../services/audit.service.js';
import { httpError } from '../utils/httpError.js';

// Connecting Telegram:
//  1. POST /link   -> we create a short code (valid 30 min)
//  2. the user sends "/start CODE" to our bot in Telegram (the deep link fills it in)
//  3. POST /verify -> we read the bot's recent messages, find the code, and store that chat id
// No webhook is needed, so this works on localhost and on Vercel alike.

// GET /api/telegram/status
export async function status(req, res) {
  const user = await User.findById(req.user._id).select('telegram');
  res.json({ configured: isConfigured(), botUsername: env.telegram.botUsername, connected: Boolean(user.telegram?.chatId), linkedAt: user.telegram?.linkedAt });
}

// POST /api/telegram/link
export async function createLinkCode(req, res) {
  if (!isConfigured()) throw httpError(503, 'Telegram is not configured on this server. Notifications still appear here in the app.');
  const code = crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g. "3F9A1C"
  await User.updateOne({ _id: req.user._id }, { 'telegram.linkCode': code, 'telegram.linkCodeExpiresAt': new Date(Date.now() + 30 * 60000) });
  res.json({ code, botUsername: env.telegram.botUsername, deepLink: env.telegram.botUsername ? `https://t.me/${env.telegram.botUsername}?start=${code}` : null });
}

// POST /api/telegram/verify
export async function verifyLink(req, res) {
  const user = await User.findById(req.user._id).select('+telegram.linkCode');
  const { linkCode, linkCodeExpiresAt } = user.telegram || {};
  if (!linkCode || linkCodeExpiresAt < new Date()) throw httpError(400, 'Your code has expired. Get a new one.');

  let messages;
  try {
    messages = await recentMessages();
  } catch (err) {
    throw httpError(502, `Could not reach Telegram: ${err.message}`);
  }
  // "/start 3F9A1C" (from the deep link) or just "3F9A1C"
  const found = messages.reverse().find((m) => m.text === `/start ${linkCode}` || m.text.toUpperCase() === linkCode);
  if (!found) throw httpError(404, "We haven't received your code yet. Send it to the bot, then press Verify again.");

  await User.updateOne(
    { _id: user._id },
    { 'telegram.chatId': found.chatId, 'telegram.linkedAt': new Date(), $unset: { 'telegram.linkCode': 1, 'telegram.linkCodeExpiresAt': 1 } }
  );
  await logAudit({ actor: req.user, action: 'telegram.link', entityType: 'user', entityId: user._id });
  await sendMessage(found.chatId, `Hi ${user.name}! UTSHOB will send your pickup assignments and reminders here.`).catch(() => {});
  res.json({ connected: true });
}

// DELETE /api/telegram/link
export async function unlink(req, res) {
  await User.updateOne({ _id: req.user._id }, { $unset: { 'telegram.chatId': 1, 'telegram.linkedAt': 1 } });
  await logAudit({ actor: req.user, action: 'telegram.unlink', entityType: 'user', entityId: req.user._id });
  res.json({ connected: false });
}
