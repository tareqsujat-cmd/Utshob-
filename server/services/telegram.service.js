// Telegram Bot API: send messages to users who connected their Telegram account.
// A user must message the bot first (we can't message strangers); getUpdates tells us their chat id.
import { env } from '../config/env.js';
import { getSetting } from './settings.service.js';

const TIMEOUT_MS = 8000;
const api = (method) => `https://api.telegram.org/bot${env.telegram.botToken}/${method}`;

export function isConfigured() {
  return Boolean(env.telegram.botToken);
}

// Send one text message. Throws an Error with a readable message if it fails, so the caller can log it.
export async function sendMessage(chatId, text) {
  // Demo switch (Admin -> Demo & settings): make every send fail to show logging, retry and the dashboard fallback.
  if (await getSetting('telegramFaultInjection')) throw new Error('Simulated Telegram outage (demo switch is on)');
  if (!isConfigured()) throw new Error('Telegram bot is not configured on this server');

  let response;
  try {
    response = await fetch(api('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`Telegram unreachable: ${err.message}`);
  }
  const data = await response.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram error: ${data.description || response.status}`);
  return data.result;
}

// Recent messages people sent to the bot: [{ chatId, text, from }]. Used to link accounts.
export async function recentMessages() {
  if (!isConfigured()) throw new Error('Telegram bot is not configured on this server');
  const response = await fetch(`${api('getUpdates')}?allowed_updates=${encodeURIComponent('["message"]')}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await response.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram error: ${data.description || response.status}`);
  return data.result
    .filter((u) => u.message?.text)
    .map((u) => ({ chatId: String(u.message.chat.id), text: u.message.text.trim(), from: u.message.from?.first_name || '' }));
}
