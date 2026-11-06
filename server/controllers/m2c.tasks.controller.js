import { CollectionTask } from '../models/CollectionTask.js';
import { Reservation } from '../models/Reservation.js';
import { SurplusListing } from '../models/SurplusListing.js';
import { Notification } from '../models/Notification.js';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { ACTIVE_TASK_STATUSES, TASK_TRANSITIONS, REMINDER_WINDOW_HOURS } from '../config/constants.js';
import { releaseQuantity } from '../services/surplus.service.js';
import { notifyUsers, deliverTelegram } from '../services/notify.service.js';
import { logAudit } from '../services/audit.service.js';
import { httpError } from '../utils/httpError.js';

const fmt = (date) => new Date(date).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });

// Coordinators of the task's organization, plus the people the task concerns.
async function coordinatorsOf(organizationId) {
  return (await Organization.findById(organizationId).select('coordinators'))?.coordinators || [];
}

// Who may see / update a task: its organization's coordinators, the assigned volunteer, admins.
function canAccess(task, user) {
  if (user.role === 'admin') return true;
  if (user.organization && String(user.organization) === String(task.organization)) return true;
  return task.collector.user && String(task.collector.user) === String(user._id);
}

// GET /api/volunteers?division=: approved volunteers a coordinator can assign
export async function listVolunteers(req, res) {
  const filter = { role: 'volunteer', approvalStatus: 'approved' };
  if (req.validQuery.division) filter.division = req.validQuery.division;
  const volunteers = await User.find(filter).select('name phone division district telegram.linkedAt').sort({ name: 1 });
  res.json({ volunteers: volunteers.map((v) => ({ _id: v._id, name: v.name, phone: v.phone, district: v.district, telegramConnected: Boolean(v.telegram?.linkedAt) })) });
}

// POST /api/reservations/:id/tasks   header: Idempotency-Key
// Only ONE active task per reservation: the unique `activeKey` index refuses a second one.
export async function assignCollector(req, res) {
  const key = req.get('Idempotency-Key');
  if (key) {
    const previous = await CollectionTask.findOne({ idempotencyKey: key });
    if (previous) return res.status(200).json({ task: previous, repeated: true });
  }

  const reservation = await Reservation.findOne({ _id: req.params.id, organization: req.user.organization });
  if (!reservation) throw httpError(404, 'Reservation not found');
  if (!['reserved', 'collection_assigned'].includes(reservation.status)) {
    throw httpError(409, `This reservation is ${reservation.status.replace('_', ' ')}; nothing left to collect`);
  }

  const { collectorType, volunteerId, collectorName, collectorPhone, scheduledAt } = req.body;
  let collector = { type: 'org_arranged', name: collectorName, phone: collectorPhone };
  if (collectorType === 'volunteer') {
    const volunteer = await User.findOne({ _id: volunteerId, role: 'volunteer', approvalStatus: 'approved' });
    if (!volunteer) throw httpError(404, 'Volunteer not found');
    collector = { type: 'volunteer', user: volunteer._id, name: volunteer.name, phone: volunteer.phone };
  }

  let task;
  try {
    task = await CollectionTask.create({
      reservation: reservation._id,
      listing: reservation.listing,
      organization: reservation.organization,
      assignedBy: req.user._id,
      collector,
      scheduledAt,
      activeKey: String(reservation._id),
      idempotencyKey: key || undefined,
      history: [{ status: 'assigned', by: req.user._id, note: `Collector: ${collector.name}` }],
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    if (key) {
      const same = await CollectionTask.findOne({ idempotencyKey: key });
      if (same) return res.status(200).json({ task: same, repeated: true });
    }
    throw httpError(409, 'This reservation already has an active collection task. Update or cancel that one first.');
  }

  await Reservation.updateOne({ _id: reservation._id }, { status: 'collection_assigned', $push: { history: { action: 'collector assigned', by: req.user._id, note: collector.name } } });
  await logAudit({ actor: req.user, action: 'task.assign', entityType: 'collection_task', entityId: task._id, changes: [{ field: 'collector', from: null, to: collector.name }] });

  const listing = await SurplusListing.findById(reservation.listing).select('foodType unit pickupLocation postedBy');
  await notifyUsers([collector.user, listing.postedBy], {
    type: 'task.assigned',
    title: `Pickup assigned: ${reservation.quantityReserved} ${reservation.unit} ${listing.foodType}`,
    body: `${collector.name} collects at ${fmt(scheduledAt)} from ${listing.pickupLocation.address || listing.pickupLocation.district}.`,
    link: '/tasks',
    relatedTask: task._id,
    telegram: true,
  });
  res.status(201).json({ task });
}

// GET /api/tasks?status=active|done: coordinators see their organization's, volunteers their own
export async function listTasks(req, res) {
  let filter = {};
  if (req.user.role === 'volunteer') filter = { 'collector.user': req.user._id };
  else if (req.user.role !== 'admin') filter = { organization: req.user.organization };
  if (req.query.status === 'active') filter.status = { $in: ACTIVE_TASK_STATUSES };
  if (req.query.status === 'done') filter.status = { $nin: ACTIVE_TASK_STATUSES };

  const tasks = await CollectionTask.find(filter)
    .sort({ scheduledAt: -1 })
    .limit(100)
    .populate({ path: 'listing', select: 'foodType unit pickupLocation pickupDeadline postedBy', populate: { path: 'postedBy', select: 'name phone' } })
    .populate('reservation', 'quantityReserved quantityCollected unit status')
    .populate('organization', 'name type');

  // Telegram delivery state of the notifications about each task (for the dashboard log).
  const notifications = await Notification.find({ relatedTask: { $in: tasks.map((t) => t._id) }, 'telegram.status': { $ne: 'skipped' } })
    .populate('user', 'name')
    .sort({ createdAt: -1 });
  res.json({
    tasks: tasks.map((t) => ({ ...t.toObject(), deliveries: notifications.filter((n) => String(n.relatedTask) === String(t._id)) })),
  });
}

// PATCH /api/tasks/:id/status   body: { status, quantityCollected?, delayMinutes?, reason? }
export async function updateTaskStatus(req, res) {
  const task = await CollectionTask.findById(req.params.id);
  if (!task || !canAccess(task, req.user)) throw httpError(404, 'Task not found');
  const { status, quantityCollected, delayMinutes, reason } = req.body;
  if (!TASK_TRANSITIONS[task.status].includes(status)) throw httpError(409, `A ${task.status.replace('_', ' ')} task cannot become ${status.replace('_', ' ')}`);

  const reservation = await Reservation.findById(task.reservation);
  if (['collected', 'partially_collected'].includes(status)) {
    if (quantityCollected > reservation.quantityReserved) throw httpError(400, `Only ${reservation.quantityReserved} ${reservation.unit} were reserved`);
    if (status === 'collected' && quantityCollected !== reservation.quantityReserved) throw httpError(400, 'Collected everything? Then the quantity must equal the reserved quantity; otherwise choose "partially collected".');
  }

  const final = !ACTIVE_TASK_STATUSES.includes(status);
  const update = {
    $set: {
      status,
      ...(quantityCollected !== undefined && { quantityCollected }),
      ...(status === 'delayed' && { delay: { minutes: delayMinutes, reason } }),
      ...(status === 'cancelled' && { cancelReason: reason }),
    },
    $push: { history: { status, by: req.user._id, note: reason || (quantityCollected !== undefined ? `${quantityCollected} ${reservation.unit}` : '') } },
    ...(final && { $unset: { activeKey: 1 } }), // free the reservation for a new task
  };
  // Guarded: only if the status is still what we checked (two people updating at once).
  const updated = await CollectionTask.findOneAndUpdate({ _id: task._id, status: task.status }, update, { returnDocument: 'after' });
  if (!updated) throw httpError(409, 'This task was just updated by someone else. Reload and try again.');

  // What it means for the reservation (all quantities kept in separate fields).
  if (status === 'collected' || status === 'partially_collected') {
    await Reservation.updateOne({ _id: reservation._id }, {
      status,
      quantityCollected,
      quantityShortage: reservation.quantityReserved - quantityCollected, // not there at pickup (M3-F records it as shortage)
    });
  } else if (status === 'cancelled') {
    await Reservation.updateOne({ _id: reservation._id }, { status: 'reserved' }); // still reserved: assign someone else
  } else if (status === 'missed') {
    // Nobody came: give the food back so another organization can take it (if still before the deadline).
    await Reservation.updateOne({ _id: reservation._id }, { status: 'missed', quantityReleased: reservation.quantityReserved });
    await releaseQuantity(reservation.listing, reservation.quantityReserved);
  }

  await logAudit({ actor: req.user, action: 'task.status', entityType: 'collection_task', entityId: task._id, changes: [{ field: 'status', from: task.status, to: status }], reason });

  const listing = await SurplusListing.findById(task.listing).select('foodType postedBy');
  const words = { en_route: 'is on the way', delayed: `is delayed by ${delayMinutes} min`, collected: 'collected everything', partially_collected: `collected ${quantityCollected} ${reservation.unit}`, cancelled: 'was cancelled', missed: 'was missed' };
  await notifyUsers([...(await coordinatorsOf(task.organization)), listing.postedBy, task.collector.user].filter((id) => id && String(id) !== String(req.user._id)), {
    type: `task.${status}`,
    title: `Pickup of ${listing.foodType} ${words[status]}`,
    body: reason,
    link: '/tasks',
    relatedTask: task._id,
    telegram: true,
  });
  res.json({ task: updated });
}

// Remind collectors about pickups starting soon. Each task is reminded once (reminderSentAt claim),
// and the notification has a dedupeKey, so running this twice never sends twice.
async function sendDueReminders(scope) {
  const now = new Date();
  const soon = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 3600000);
  const due = await CollectionTask.find({ ...scope, status: { $in: ['assigned', 'delayed'] }, scheduledAt: { $gte: now, $lte: soon }, reminderSentAt: null })
    .populate('listing', 'foodType pickupLocation');

  let sent = 0;
  for (const task of due) {
    const claimed = await CollectionTask.findOneAndUpdate({ _id: task._id, reminderSentAt: null }, { reminderSentAt: now });
    if (!claimed) continue;
    sent += 1;
    await notifyUsers([task.collector.user, ...(await coordinatorsOf(task.organization))], {
      type: 'task.reminder',
      title: `Reminder: pickup of ${task.listing.foodType} at ${fmt(task.scheduledAt)}`,
      body: `Collector: ${task.collector.name}. Place: ${task.listing.pickupLocation.address || task.listing.pickupLocation.district}.`,
      link: '/tasks',
      relatedTask: task._id,
      dedupeKey: `reminder:${task._id}:${task.scheduledAt.toISOString()}`,
      telegram: true,
    });
  }
  return { remindersSent: sent };
}

// POST /api/tasks/reminders/send-due: a coordinator's button (own organization) or an admin (all)
export async function sendRemindersNow(req, res) {
  const scope = req.user.role === 'admin' ? {} : { organization: req.user.organization };
  res.json(await sendDueReminders(scope));
}

// GET /api/cron/reminders: Vercel Cron, authorised by the CRON_SECRET header (no user login)
export async function cronReminders(req, res) {
  if (!env.cronSecret || req.get('Authorization') !== `Bearer ${env.cronSecret}`) throw httpError(401, 'Not allowed');
  res.json(await sendDueReminders({}));
}

// POST /api/notifications/:id/retry: re-send the SAME notification on Telegram.
// It never creates a task or a new notification, so retries can't duplicate anything.
export async function retryTelegram(req, res) {
  const notification = await Notification.findById(req.params.id);
  if (!notification?.relatedTask) throw httpError(404, 'Notification not found');
  const task = await CollectionTask.findById(notification.relatedTask);
  if (!task || !canAccess(task, req.user) || req.user.role === 'volunteer') throw httpError(404, 'Notification not found');
  if (notification.telegram.status !== 'failed') throw httpError(409, `Nothing to retry: delivery is ${notification.telegram.status}`);
  res.json({ notification: await deliverTelegram(notification._id) });
}
