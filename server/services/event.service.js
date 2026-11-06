import { Event } from '../models/Event.js';
import { ACTIVE_EVENT_STATUSES } from '../config/constants.js';
import { notifyUsers } from './notify.service.js';
import { httpError } from '../utils/httpError.js';

const sameId = (a, b) => String(a) === String(b);

export function isOrganizer(event, user) {
  return event.organizers.some((id) => sameId(id._id || id, user._id));
}

export function isOwner(event, user) {
  return sameId(event.owner._id || event.owner, user._id);
}

// Load an event the user may SEE: its organizers, or an admin. Everyone else gets 404
// (not 403), so people can't discover which event ids exist.
export async function findEventForUser(eventId, user) {
  const event = await Event.findById(eventId);
  if (!event || (!isOrganizer(event, user) && user.role !== 'admin')) throw httpError(404, 'Event not found');
  return event;
}

// Load an event the user may CHANGE: organizers only (owner only for some actions),
// and only while it is a draft or planned. Cancelled and completed events are read-only history.
export async function findEditableEvent(eventId, user, { ownerOnly = false } = {}) {
  const event = await findEventForUser(eventId, user);
  if (ownerOnly && !isOwner(event, user)) throw httpError(403, 'Only the event owner can do this');
  if (!ownerOnly && !isOrganizer(event, user)) throw httpError(403, 'Only organizers can change this event');
  if (!ACTIVE_EVENT_STATUSES.includes(event.status)) {
    throw httpError(409, `This event is ${event.status}. Its records are kept read-only.`);
  }
  return event;
}

// How many events of this owner count against the plan's "active events" limit.
export function countActiveEvents(ownerId) {
  return Event.countDocuments({ owner: ownerId, status: { $in: ACTIVE_EVENT_STATUSES } });
}

// Tell everyone involved in an event about a change, except the person who made it.
// Today: the other organizers. M1-C adds coordinators with reservations, M3-C adds booked providers.
export async function notifyEventParties(event, actor, { type, title, body }) {
  const recipients = event.organizers.filter((id) => !sameId(id, actor._id));
  return notifyUsers(recipients, { type, title, body, link: `/events/${event._id}` });
}
