import { Event } from '../models/Event.js';
import { Budget } from '../models/Budget.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import {
  findEventForUser, findEditableEvent, countActiveEvents, notifyEventParties, isOwner, isOrganizer,
} from '../services/event.service.js';
import { createScenario, emptyLines } from '../services/budget.service.js';
import { assertWithinLimit, assertCountAllowed, getEffectivePlan } from '../services/plan.service.js';
import { logAudit, diffFields } from '../services/audit.service.js';
import { notifyUsers } from '../services/notify.service.js';
import { httpError } from '../utils/httpError.js';

// Changing any of these is a "requirement change": it needs a reason and appears in the history.
const REQUIREMENT_FIELDS = ['guestCount', 'budgetTotal', 'location', 'dietary', 'requiredServices'];
const OTHER_FIELDS = ['title', 'eventType', 'notes'];

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/events?q=&status=&from=&to=   (my events; admins see all)
export async function listEvents(req, res) {
  const { q, status, from, to } = req.validQuery;
  const filter = req.user.role === 'admin' ? {} : { organizers: req.user._id };
  if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };
  if (status) filter.status = status;
  if (from || to) filter.startsAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };

  const events = await Event.find(filter)
    .select('title eventType startsAt endsAt location guestCount budgetTotal status owner')
    .sort({ startsAt: -1 })
    .limit(100);

  // Plan usage, so the page can show "1 of 1 active events".
  const plan = await getEffectivePlan(req.user);
  const activeCount = await countActiveEvents(req.user._id);
  res.json({ events, usage: { activeEvents: activeCount, limit: plan.limits.activeEvents, planName: plan.name } });
}

// POST /api/events
export async function createEvent(req, res) {
  await assertWithinLimit(req.user, 'activeEvents', await countActiveEvents(req.user._id));

  const event = await Event.create({ ...req.body, owner: req.user._id, organizers: [req.user._id] });
  // Every event starts with one primary budget scenario, all lines at zero.
  await createScenario({
    eventId: event._id, name: 'Standard', isPrimary: true, lines: emptyLines(),
    user: req.user, reason: 'Event created', source: 'initial',
  });
  await logAudit({ actor: req.user, action: 'event.create', entityType: 'event', entityId: event._id });
  res.status(201).json({ event });
}

// GET /api/events/:id
export async function getEvent(req, res) {
  const event = await findEventForUser(req.params.id, req.user);
  await event.populate([{ path: 'organizers', select: 'name email' }, { path: 'owner', select: 'name email' }]);
  res.json({
    event,
    permissions: {
      isOwner: isOwner(event, req.user),
      canEdit: isOrganizer(event, req.user) && ['draft', 'planned'].includes(event.status),
    },
  });
}

// PATCH /api/events/:id: edit details; requirement changes need a reason.
export async function updateEvent(req, res) {
  const event = await findEditableEvent(req.params.id, req.user);
  const { reason, ...fields } = req.body;

  const before = event.toObject();
  event.set(fields);
  const changes = diffFields(before, event.toObject(), [...REQUIREMENT_FIELDS, ...OTHER_FIELDS]);
  const requirementChanged = changes.some((c) => REQUIREMENT_FIELDS.includes(c.field));

  if (requirementChanged && !reason) {
    throw httpError(400, 'Please say why the requirements changed', [
      { field: 'reason', message: 'Required when guest count, budget, location, dietary needs or services change' },
    ]);
  }
  await event.save();

  if (changes.length) {
    await logAudit({ actor: req.user, action: 'event.update', entityType: 'event', entityId: event._id, changes, reason });
  }
  const guestCountChanged = changes.some((c) => c.field === 'guestCount');
  res.json({ event, foodPlanNeedsReview: guestCountChanged });
}

// POST /api/events/:id/plan: a draft becomes a planned event.
export async function markPlanned(req, res) {
  await findEditableEvent(req.params.id, req.user);
  // Guarded: only works if it is still a draft.
  const event = await Event.findOneAndUpdate({ _id: req.params.id, status: 'draft' }, { status: 'planned' }, { returnDocument: 'after' });
  if (!event) throw httpError(409, 'Only a draft can be marked as planned');
  await logAudit({ actor: req.user, action: 'event.plan', entityType: 'event', entityId: event._id, changes: [{ field: 'status', from: 'draft', to: 'planned' }] });
  res.json({ event });
}

// POST /api/events/:id/complete: after the event has started, the owner closes it.
export async function markCompleted(req, res) {
  const event = await findEditableEvent(req.params.id, req.user, { ownerOnly: true });
  if (event.status !== 'planned' || event.startsAt > new Date()) {
    throw httpError(409, 'Only a planned event that has already started can be completed');
  }
  event.status = 'completed';
  await event.save();
  await logAudit({ actor: req.user, action: 'event.complete', entityType: 'event', entityId: event._id, changes: [{ field: 'status', from: 'planned', to: 'completed' }] });
  res.json({ event });
}

// POST /api/events/:id/copy: a previous event becomes a new DRAFT with the same requirements.
// Bookings, RSVPs and batches are NOT copied; prices must be re-checked.
export async function copyEvent(req, res) {
  const source = await findEventForUser(req.params.id, req.user);
  await assertWithinLimit(req.user, 'activeEvents', await countActiveEvents(req.user._id));

  const event = await Event.create({
    owner: req.user._id,
    organizers: [req.user._id],
    title: req.body.title || `${source.title} (copy)`,
    eventType: source.eventType,
    startsAt: req.body.startsAt,
    endsAt: req.body.endsAt,
    location: source.location,
    guestCount: source.guestCount,
    budgetTotal: source.budgetTotal,
    menu: source.menu.map(({ name, course, unit, quantityPerGuest, portionsPerUnit }) => ({ name, course, unit, quantityPerGuest, portionsPerUnit })),
    dietary: source.dietary,
    requiredServices: source.requiredServices,
    notes: source.notes,
    status: 'draft',
    copiedFrom: source._id,
  });

  const sourceBudget = await Budget.findOne({ event: source._id, isPrimary: true });
  await createScenario({
    eventId: event._id, name: 'Standard', isPrimary: true, lines: sourceBudget ? sourceBudget.lines : emptyLines(),
    user: req.user, reason: `Copied from "${source.title}". Prices and availability may have changed.`, source: 'copy',
  });
  await logAudit({
    actor: req.user, action: 'event.copy', entityType: 'event', entityId: event._id,
    changes: [{ field: 'copiedFrom', from: null, to: source.title }],
  });
  res.status(201).json({ event });
}

// POST /api/events/:id/cancel   body: { reason }
// Records (bookings, prepared food, donations) are kept for review; nothing is deleted.
export async function cancelEvent(req, res) {
  const event = await findEditableEvent(req.params.id, req.user, { ownerOnly: true });
  const previousStatus = event.status;
  event.status = 'cancelled';
  event.cancelReason = req.body.reason;
  await event.save();

  await logAudit({
    actor: req.user, action: 'event.cancel', entityType: 'event', entityId: event._id,
    changes: [{ field: 'status', from: previousStatus, to: 'cancelled' }], reason: req.body.reason,
  });
  await notifyEventParties(event, req.user, {
    type: 'event.cancelled', title: `Event cancelled: ${event.title}`, body: req.body.reason,
  });
  res.json({ event });
}

// POST /api/events/:id/reschedule   body: { startsAt, endsAt, reason }
export async function rescheduleEvent(req, res) {
  const event = await findEditableEvent(req.params.id, req.user, { ownerOnly: true });
  const before = event.toObject();
  event.startsAt = req.body.startsAt;
  event.endsAt = req.body.endsAt;
  await event.save();

  const changes = diffFields(before, event.toObject(), ['startsAt', 'endsAt']);
  await logAudit({ actor: req.user, action: 'event.reschedule', entityType: 'event', entityId: event._id, changes, reason: req.body.reason });
  await notifyEventParties(event, req.user, {
    type: 'event.rescheduled',
    title: `Event rescheduled: ${event.title}`,
    body: `New date: ${event.startsAt.toDateString()}. ${req.body.reason}`,
  });
  // M3-C adds here: re-check venue availability and flag affected bookings for review.
  res.json({ event });
}

// GET /api/events/:id/history: requirement changes of the event and its budgets, newest first.
export async function getHistory(req, res) {
  const event = await findEventForUser(req.params.id, req.user);
  const budgetIds = await Budget.find({ event: event._id }).distinct('_id');
  const logs = await AuditLog.find({
    $or: [
      { entityType: 'event', entityId: event._id },
      { entityType: 'budget', entityId: { $in: budgetIds } },
    ],
  })
    .sort({ at: -1 })
    .populate('actor', 'name');
  res.json({ logs });
}

// PUT /api/events/:id/organizers   body: { emails: [...] } (co-organizers; the owner is always included)
export async function setOrganizers(req, res) {
  const event = await findEditableEvent(req.params.id, req.user, { ownerOnly: true });
  const emails = [...new Set(req.body.emails.map((e) => e.toLowerCase()))];
  const users = await User.find({ email: { $in: emails }, role: 'host' }).select('_id email name');

  const unknown = emails.filter((e) => !users.some((u) => u.email === e));
  if (unknown.length) throw httpError(400, `No host account found for: ${unknown.join(', ')}`);

  const ownerId = String(event.owner);
  const newIds = [ownerId, ...users.map((u) => String(u._id)).filter((id) => id !== ownerId)];
  await assertCountAllowed(req.user, 'organizers', newIds.length);

  const previous = event.organizers.map(String);
  event.organizers = newIds;
  await event.save();

  const added = newIds.filter((id) => !previous.includes(id));
  await logAudit({
    actor: req.user, action: 'event.organizers', entityType: 'event', entityId: event._id,
    changes: [{ field: 'organizers', from: previous.length, to: newIds.length }],
  });
  await notifyUsers(added, { type: 'event.organizer_added', title: `You are now an organizer of ${event.title}`, link: `/events/${event._id}` });

  await event.populate('organizers', 'name email');
  res.json({ organizers: event.organizers });
}
