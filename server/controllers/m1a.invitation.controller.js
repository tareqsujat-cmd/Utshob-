import crypto from 'node:crypto';
import { Event } from '../models/Event.js';
import { Rsvp } from '../models/Rsvp.js';
import { findEventForUser, findEditableEvent } from '../services/event.service.js';
import { logAudit, diffFields } from '../services/audit.service.js';
import { httpError } from '../utils/httpError.js';

// "Nusrat's Wedding Reception!" -> "nusrat-s-wedding-reception-3f9a1c"
// The random end makes the address unguessable and unique.
function makeSlug(title) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

// The RSVP deadline counts until the end of that day.
function rsvpOpen(event) {
  if (event.status !== 'planned' || !event.invitation.isPublished) return false;
  const deadline = event.invitation.rsvpDeadline;
  return !deadline || Date.now() <= new Date(deadline).setHours(23, 59, 59, 999);
}

// PUT /api/events/:id/invitation
export async function saveInvitation(req, res) {
  const event = await findEditableEvent(req.params.id, req.user);
  const before = event.toObject().invitation; // plain copy of the current values
  const slug = before.slug || makeSlug(event.title);
  event.invitation = { ...req.body, slug };
  await event.save();

  const changes = diffFields(before, event.toObject().invitation, ['heading', 'message', 'theme', 'rsvpDeadline', 'isPublished']);
  if (changes.length) {
    await logAudit({ actor: req.user, action: 'event.invitation', entityType: 'event', entityId: event._id, changes });
  }
  res.json({ invitation: event.invitation });
}

// GET /api/public/invitations/:slug: no login. Only published invitations are visible.
export async function getPublicInvitation(req, res) {
  const event = await Event.findOne({ 'invitation.slug': req.params.slug, 'invitation.isPublished': true })
    .populate('owner', 'name');
  if (!event) throw httpError(404, 'Invitation not found');

  res.json({
    invitation: {
      title: event.title,
      eventType: event.eventType,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: { division: event.location.division, district: event.location.district, address: event.location.address },
      hostName: event.owner.name,
      heading: event.invitation.heading,
      message: event.invitation.message,
      theme: event.invitation.theme,
      rsvpDeadline: event.invitation.rsvpDeadline,
      cancelled: event.status === 'cancelled',
      acceptingRsvps: rsvpOpen(event),
    },
  });
}

// POST /api/public/invitations/:slug/rsvp: no login. One answer per phone number per event:
// answering again UPDATES it (upsert), so a guest can never be counted twice.
export async function submitRsvp(req, res) {
  const event = await Event.findOne({ 'invitation.slug': req.params.slug, 'invitation.isPublished': true });
  if (!event) throw httpError(404, 'Invitation not found');
  if (!rsvpOpen(event)) {
    throw httpError(409, event.status === 'cancelled' ? 'This event has been cancelled' : 'RSVPs are closed for this event');
  }

  const { guestName, phone, response, partySize, dietaryNotes } = req.body;
  const filter = { event: event._id, contact: phone };
  const existed = await Rsvp.exists(filter);
  const rsvp = await Rsvp.findOneAndUpdate(
    filter,
    { $set: { guestName, response, partySize: response === 'no' ? 1 : partySize, dietaryNotes } },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );
  res.status(existed ? 200 : 201).json({ rsvp: { guestName: rsvp.guestName, response: rsvp.response, partySize: rsvp.partySize }, updated: Boolean(existed) });
}

// GET /api/events/:id/rsvps: answers and totals for the organizers
export async function listRsvps(req, res) {
  const event = await findEventForUser(req.params.id, req.user);
  const rsvps = await Rsvp.find({ event: event._id }).sort({ updatedAt: -1 });

  const totals = { yes: 0, no: 0, maybe: 0, confirmedGuests: 0, maybeGuests: 0 };
  for (const r of rsvps) {
    totals[r.response] += 1;
    if (r.response === 'yes') totals.confirmedGuests += r.partySize;
    if (r.response === 'maybe') totals.maybeGuests += r.partySize;
  }
  res.json({ rsvps, totals, expectedGuests: event.guestCount });
}
