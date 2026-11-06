import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { eventsApi } from '../../api/m1a.events.api.js';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Alert, StatTile } from '../../components/ui/Layout.jsx';
import { Input, Textarea, Select, Checkbox } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { LoadingState, ErrorState } from '../../components/ui/States.jsx';
import { formatDateTime, toDateInput } from '../../components/ui/format.js';
import { InvitationCard } from './InvitationCard.jsx';

const SWATCH = { marigold: '#e39b2d', teal: '#0e5e5a', rose: '#b8435e', night: '#1c2b2d' };

// M1-A: customise the invitation (live preview), publish it, and see RSVPs.
export function EventInvitationTab() {
  const { event, permissions, reloadEvent } = useOutletContext();
  return (
    <div className="space-y-6">
      <InvitationEditor key={event.updatedAt} event={event} canEdit={permissions.canEdit} onSaved={reloadEvent} />
      <RsvpList event={event} />
    </div>
  );
}

function InvitationEditor({ event, canEdit, onSaved }) {
  const meta = useMeta();
  const inv = event.invitation || {};
  const [form, setForm] = useState({
    heading: inv.heading || '',
    message: inv.message || '',
    theme: { palette: inv.theme?.palette || 'marigold', font: inv.theme?.font || 'classic', layout: inv.theme?.layout || 'centered' },
    rsvpDeadline: toDateInput(inv.rsvpDeadline),
    isPublished: Boolean(inv.isPublished),
  });
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const setTheme = (changes) => setForm({ ...form, theme: { ...form.theme, ...changes } });
  const publicUrl = inv.slug ? `${window.location.origin}/invite/${inv.slug}` : null;

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await eventsApi.saveInvitation(event._id, { ...form, rsvpDeadline: form.rsvpDeadline || null });
      setMessage({ tone: 'success', text: 'Invitation saved.' });
      onSaved();
    } catch (err) {
      setMessage({ tone: 'danger', text: err.message });
      setBusy(false);
    }
  }

  if (!meta) return <LoadingState />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Invitation" subtitle="Write the words, pick a design, and publish when ready." />
        <div className="space-y-4">
          <Input label="Heading" disabled={!canEdit} value={form.heading} onChange={(e) => setForm({ ...form, heading: e.target.value })} />
          <Textarea label="Message" rows={4} disabled={!canEdit} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          <div>
            <p className="mb-1.5 text-sm font-medium">Colours</p>
            <div className="flex gap-2">
              {meta.invitationPalettes.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={!canEdit}
                  aria-label={p}
                  aria-pressed={form.theme.palette === p}
                  onClick={() => setTheme({ palette: p })}
                  className={`h-9 w-9 rounded-full border-2 ${form.theme.palette === p ? 'border-ink ring-2 ring-accent/40' : 'border-white'}`}
                  style={{ background: SWATCH[p] }}
                />
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Font" disabled={!canEdit} value={form.theme.font} options={meta.invitationFonts.map((f) => ({ value: f, label: f === 'classic' ? 'Classic serif' : 'Modern sans' }))} onChange={(e) => setTheme({ font: e.target.value })} />
            <Select label="Layout" disabled={!canEdit} value={form.theme.layout} options={meta.invitationLayouts.map((l) => ({ value: l, label: l === 'centered' ? 'Centred with flower' : 'Coloured banner' }))} onChange={(e) => setTheme({ layout: e.target.value })} />
          </div>
          <Input label="Reply by" type="date" disabled={!canEdit} value={form.rsvpDeadline} onChange={(e) => setForm({ ...form, rsvpDeadline: e.target.value })} />
          <Checkbox label="Published: guests with the link can see it and reply" disabled={!canEdit} checked={form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} />
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          {canEdit && <Button loading={busy} icon="check" onClick={save}>Save invitation</Button>}
          {publicUrl && inv.isPublished && (
            <div className="rounded-xl bg-paper p-3 text-sm">
              <p className="mb-1 font-semibold">Share this link with guests</p>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">{publicUrl}</a>
            </div>
          )}
        </div>
      </Card>
      <div>
        <p className="mb-2 text-sm font-semibold text-muted">Live preview</p>
        <InvitationCard details={{ title: event.title, startsAt: event.startsAt, location: event.location, hostName: event.owner.name }} invitation={form} />
      </div>
    </div>
  );
}

function RsvpList({ event }) {
  const { data, loading, error, reload } = useFetch(`/events/${event._id}/rsvps`);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { totals, rsvps, expectedGuests } = data;
  const tone = { yes: 'success', no: 'danger', maybe: 'warning' };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Confirmed guests" value={totals.confirmedGuests} icon="users" tone="success" hint={`of ${expectedGuests} expected`} />
        <StatTile label="Yes answers" value={totals.yes} icon="check" />
        <StatTile label="Maybe" value={totals.maybe} icon="clock" tone="warning" hint={`${totals.maybeGuests} people`} />
        <StatTile label="Can't come" value={totals.no} icon="x" tone="danger" />
      </div>
      <Card padded={false}>
        <div className="px-5 pt-5 md:px-6"><CardHeader title="Replies" subtitle="Each phone number can answer once; answering again updates the reply." /></div>
        {rsvps.length === 0 ? <p className="px-6 pb-6 text-sm text-muted">No replies yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2 md:px-6">Guest</th><th className="px-3 py-2">Answer</th><th className="px-3 py-2">People</th><th className="px-3 py-2">Dietary</th><th className="px-5 py-2 md:px-6">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rsvps.map((r) => (
                  <tr key={r._id} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-2.5 md:px-6"><p className="font-medium">{r.guestName}</p><p className="text-xs text-muted">{r.contact}</p></td>
                    <td className="px-3 py-2.5"><Badge tone={tone[r.response]} className="capitalize">{r.response}</Badge></td>
                    <td className="px-3 py-2.5">{r.response === 'no' ? '—' : r.partySize}</td>
                    <td className="px-3 py-2.5">{r.dietaryNotes || '—'}</td>
                    <td className="px-5 py-2.5 md:px-6">{formatDateTime(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
