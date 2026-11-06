import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch.js';
import { fieldErrors } from '../../api/client.js';
import { eventsApi } from '../../api/m1a.events.api.js';
import { Alert } from '../../components/ui/Layout.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Input, Textarea } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { LoadingState, ErrorState } from '../../components/ui/States.jsx';
import { formatDate } from '../../components/ui/format.js';
import { Logo } from '../../components/layout/Logo.jsx';
import { InvitationCard } from './InvitationCard.jsx';

// M1-A: the page guests open from the invitation link. No account needed.
export function PublicInvitationPage() {
  const { slug } = useParams();
  const { data, loading, error, reload } = useFetch(`/public/invitations/${slug}`);

  return (
    <div className="min-h-screen bg-paper px-4 py-8">
      <div className="mx-auto max-w-xl space-y-6">
        {loading && <LoadingState />}
        {error && <ErrorState error={error.status === 404 ? { message: 'This invitation does not exist or is not published.' } : error} onRetry={reload} />}
        {data && (
          <>
            <InvitationCard details={data.invitation} invitation={data.invitation} />
            {data.invitation.cancelled ? (
              <Alert tone="danger" title="This event has been cancelled">Thank you for your interest.</Alert>
            ) : data.invitation.acceptingRsvps ? (
              <RsvpForm slug={slug} deadline={data.invitation.rsvpDeadline} />
            ) : (
              <Alert tone="info">Replies are closed for this event.</Alert>
            )}
          </>
        )}
        <div className="flex justify-center pt-4 opacity-70"><Logo /></div>
      </div>
    </div>
  );
}

function RsvpForm({ slug, deadline }) {
  const [form, setForm] = useState({ guestName: '', phone: '', response: '', partySize: 1, dietaryNotes: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const update = (changes) => setForm({ ...form, ...changes });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const result = await eventsApi.submitRsvp(slug, { ...form, partySize: Number(form.partySize) });
      setDone(result);
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Alert tone="success" title={done.updated ? 'Your reply was updated' : 'Thank you for replying'}>
        {done.rsvp.response === 'yes' ? `We look forward to seeing ${done.rsvp.partySize === 1 ? 'you' : `all ${done.rsvp.partySize} of you`}.` : 'Thank you for letting us know.'}
        {' '}You can reply again with the same phone number to change your answer.
      </Alert>
    );
  }

  const choices = [{ value: 'yes', label: "Yes, I'll come" }, { value: 'maybe', label: 'Maybe' }, { value: 'no', label: "Sorry, I can't" }];
  return (
    <Card>
      <h2 className="text-xl font-semibold">Will you come?</h2>
      {deadline && <p className="text-sm text-muted">Please reply by {formatDate(deadline)}.</p>}
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Your answer">
          {choices.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={form.response === c.value}
              onClick={() => update({ response: c.value })}
              className={`rounded-xl border px-2 py-3 text-sm font-semibold ${form.response === c.value ? 'border-primary bg-primary text-white' : 'border-line bg-card hover:border-primary'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {errors.response && <p className="text-xs font-medium text-danger">{errors.response}</p>}
        <Input label="Your name" required value={form.guestName} onChange={(e) => update({ guestName: e.target.value })} error={errors.guestName} />
        <Input label="Mobile number" type="tel" required placeholder="01XXXXXXXXX" value={form.phone} onChange={(e) => update({ phone: e.target.value })} error={errors.phone} hint="Used only so you can change your reply later." />
        {form.response !== 'no' && (
          <Input label="How many people (including you)?" type="number" min="1" max="20" value={form.partySize} onChange={(e) => update({ partySize: e.target.value })} error={errors.partySize} />
        )}
        <Textarea label="Dietary needs (optional)" rows={2} value={form.dietaryNotes} onChange={(e) => update({ dietaryNotes: e.target.value })} />
        {error && Object.keys(errors).length === 0 && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!form.response}>Send reply</Button>
      </form>
    </Card>
  );
}
