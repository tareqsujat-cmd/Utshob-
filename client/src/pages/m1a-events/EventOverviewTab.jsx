import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useMeta } from '../../hooks/useMeta.js';
import { useAuth } from '../../hooks/useAuth.js';
import { eventsApi } from '../../api/m1a.events.api.js';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Alert } from '../../components/ui/Layout.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { formatDateTime, formatTaka } from '../../components/ui/format.js';
import { MapPicker } from '../../components/MapPicker.jsx';

// M1-A: the event's requirements and its organizers.
export function EventOverviewTab() {
  const { event, permissions, reloadEvent } = useOutletContext();
  const meta = useMeta();

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader title="Requirements" />
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Starts</dt><dd className="font-medium">{formatDateTime(event.startsAt)}</dd></div>
          <div><dt className="text-xs text-muted">Ends</dt><dd className="font-medium">{formatDateTime(event.endsAt)}</dd></div>
          <div><dt className="text-xs text-muted">Expected guests</dt><dd className="font-medium">{event.guestCount}</dd></div>
          <div><dt className="text-xs text-muted">Total budget</dt><dd className="font-medium">{formatTaka(event.budgetTotal)}</dd></div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">Location</dt>
            <dd className="font-medium">{[event.location.address, event.location.district, event.location.division].filter(Boolean).join(', ')}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="mb-1 text-xs text-muted">Services needed</dt>
            <dd className="flex flex-wrap gap-1.5">
              {event.requiredServices.length === 0 && <span className="text-muted">None selected</span>}
              {event.requiredServices.map((s) => <Badge key={s} tone="primary">{meta?.serviceLabels[s]}</Badge>)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="mb-1 text-xs text-muted">Dietary requirements</dt>
            <dd className="flex flex-wrap gap-1.5">
              {event.dietary.length === 0 && <span className="text-muted">None recorded</span>}
              {event.dietary.map((d) => <Badge key={d.label}>{meta?.dietaryLabels[d.label]}: {d.guestCount}</Badge>)}
            </dd>
          </div>
          {event.notes && <div className="sm:col-span-2"><dt className="text-xs text-muted">Notes</dt><dd>{event.notes}</dd></div>}
        </dl>
        {event.location.lat && (
          <div className="mt-5">
            <MapPicker readOnly value={event.location} center={event.location} height={200} />
          </div>
        )}
      </Card>

      <Organizers event={event} canManage={permissions.isOwner && permissions.canEdit} onSaved={reloadEvent} />
    </div>
  );
}

// The owner adds co-organizers by email (host accounts). The plan limits how many.
function Organizers({ event, canManage, onSaved }) {
  const { plan } = useAuth();
  const ownerId = event.owner._id;
  const coOrganizers = event.organizers.filter((o) => o._id !== ownerId);
  const [emails, setEmails] = useState(coOrganizers.map((o) => o.email).join(', '));
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const list = emails.split(',').map((e) => e.trim()).filter(Boolean);
      await eventsApi.setOrganizers(event._id, list);
      setMessage({ tone: 'success', text: 'Organizers saved.' });
      onSaved();
    } catch (err) {
      setMessage({ tone: err.status === 402 ? 'warning' : 'danger', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Organizers" subtitle={plan ? `${plan.name} plan: up to ${plan.limits.organizers} organizer(s) per event` : ''} />
      <ul className="space-y-2">
        {event.organizers.map((o) => (
          <li key={o._id} className="flex items-center justify-between gap-2 text-sm">
            <span><span className="font-medium">{o.name}</span> <span className="text-muted">{o.email}</span></span>
            {o._id === ownerId && <Badge tone="accent">Owner</Badge>}
          </li>
        ))}
      </ul>
      {canManage && (
        <div className="mt-5 space-y-3">
          <Input label="Co-organizers (emails, comma separated)" placeholder="host2@utshob.demo" value={emails} onChange={(e) => setEmails(e.target.value)} />
          <Button size="sm" variant="secondary" loading={busy} onClick={save}>Save organizers</Button>
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
        </div>
      )}
    </Card>
  );
}
