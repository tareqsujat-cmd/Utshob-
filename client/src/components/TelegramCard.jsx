import { useState } from 'react';
import { useFetch } from '../hooks/useFetch.js';
import { collectionApi } from '../api/m2c.collection.api.js';
import { Card, CardHeader } from './ui/Card.jsx';
import { Alert } from './ui/Layout.jsx';
import { Button } from './ui/Button.jsx';
import { Badge } from './ui/Badge.jsx';
import { formatDateTime } from './ui/format.js';

// M2-C: connect your Telegram so pickup assignments and reminders also arrive there.
// Steps: get a code -> send it to the bot -> press Verify.
export function TelegramCard() {
  const { data, loading, reload } = useFetch('/telegram/status');
  const [link, setLink] = useState(null); // { code, botUsername, deepLink }
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run(action) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage({ tone: err.status === 404 ? 'warning' : 'danger', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !data) return null;
  return (
    <Card>
      <CardHeader title="Telegram notifications" subtitle="Optional. Everything also appears in the bell and on your dashboard." action={data.connected && <Badge tone="success">Connected</Badge>} />
      {!data.configured && <Alert tone="info">Telegram is not set up on this server yet. You will still see every update in the app.</Alert>}

      {data.configured && data.connected && (
        <div className="space-y-3">
          <p className="text-sm">Connected since {formatDateTime(data.linkedAt)}. Pickup assignments, changes and reminders are sent to your Telegram.</p>
          <Button variant="secondary" size="sm" loading={busy} onClick={() => run(async () => { await collectionApi.telegramUnlink(); reload(); })}>Disconnect</Button>
        </div>
      )}

      {data.configured && !data.connected && !link && (
        <Button icon="send" loading={busy} onClick={() => run(async () => setLink(await collectionApi.telegramLink()))}>Connect Telegram</Button>
      )}

      {data.configured && !data.connected && link && (
        <ol className="space-y-3 text-sm">
          <li>
            1. Open our bot{link.botUsername && <> <strong>@{link.botUsername}</strong></>} and send this code:
            <span className="ml-2 rounded-lg bg-paper px-3 py-1 font-mono text-base font-semibold tracking-widest">{link.code}</span>
          </li>
          {link.deepLink && (
            <li>
              Or tap: <a href={link.deepLink} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">open Telegram with the code</a> (then press Start)
            </li>
          )}
          <li>2. Then come back and press:</li>
          <li>
            <Button loading={busy} icon="check" onClick={() => run(async () => { await collectionApi.telegramVerify(); setLink(null); reload(); setMessage({ tone: 'success', text: 'Telegram connected. Check your Telegram for a welcome message.' }); })}>
              I sent it, verify
            </Button>
          </li>
        </ol>
      )}
      {message && <div className="mt-4"><Alert tone={message.tone}>{message.text}</Alert></div>}
    </Card>
  );
}
