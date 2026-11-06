import { CookingBatch } from '../models/CookingBatch.js';
import { Rsvp } from '../models/Rsvp.js';
import { BATCH_TRANSITIONS } from '../config/constants.js';
import { findEventForUser, findEditableEvent } from '../services/event.service.js';
import { computeFoodPlan, suggestAdjustments } from '../services/foodplan.service.js';
import { logAudit } from '../services/audit.service.js';
import { httpError } from '../utils/httpError.js';

// Total guests who answered "yes" (including their party).
async function confirmedAttendance(eventId) {
  const rows = await Rsvp.aggregate([
    { $match: { event: eventId, response: 'yes' } },
    { $group: { _id: null, guests: { $sum: '$partySize' } } },
  ]);
  return rows[0]?.guests || 0;
}

// PUT /api/events/:id/menu   body: { menu, reason }
export async function saveMenu(req, res) {
  const event = await findEditableEvent(req.params.id, req.user);
  const { menu, reason } = req.body;

  // Consistent units: a dish that already has batches can't switch unit (kg batches can't become litres).
  const batches = await CookingBatch.find({ event: event._id, status: { $ne: 'cancelled' } });
  for (const item of menu) {
    const old = item._id && event.menu.id(item._id);
    if (old && old.unit !== item.unit && batches.some((b) => String(b.menuItemId) === String(old._id))) {
      throw httpError(409, `${old.name} already has batches in ${old.unit}. Keep the same unit, or add it as a new dish.`);
    }
  }
  if (event.menu.length > 0 && !reason) {
    throw httpError(400, 'Please say why the menu changed', [{ field: 'reason', message: 'Required when changing an existing menu' }]);
  }

  const before = event.menu.map((m) => `${m.name} (${m.quantityPerGuest} ${m.unit}/guest)`);
  event.menu = menu; // items with an _id keep it, so their batches stay linked
  await event.save();
  const after = event.menu.map((m) => `${m.name} (${m.quantityPerGuest} ${m.unit}/guest)`);

  await logAudit({
    actor: req.user, action: 'event.menu', entityType: 'event', entityId: event._id,
    changes: [{ field: 'menu', from: before.join(', '), to: after.join(', ') }], reason,
  });
  res.json({ menu: event.menu });
}

// GET /api/events/:id/food-plan?attendance=
export async function getFoodPlan(req, res) {
  const event = await findEventForUser(req.params.id, req.user);
  const batches = await CookingBatch.find({ event: event._id }).sort({ createdAt: 1 });
  const confirmed = await confirmedAttendance(event._id);
  const attendance = req.validQuery.attendance ?? event.guestCount;

  res.json({
    guestCount: event.guestCount,
    confirmedAttendance: confirmed,
    attendance,
    menu: event.menu,
    plan: computeFoodPlan(event.menu, batches, attendance),
    batches,
  });
}

// POST /api/events/:id/batches   body: { menuItemId, quantity, note }
export async function addBatch(req, res) {
  const event = await findEditableEvent(req.params.id, req.user);
  const item = event.menu.id(req.body.menuItemId);
  if (!item) throw httpError(404, 'That dish is not on the menu');

  const batch = await CookingBatch.create({
    event: event._id,
    menuItemId: item._id,
    menuItemName: item.name,
    quantity: req.body.quantity,
    unit: item.unit, // always the dish's unit, never chosen freely
    note: req.body.note,
    createdBy: req.user._id,
  });
  await logAudit({ actor: req.user, action: 'batch.create', entityType: 'event', entityId: event._id, changes: [{ field: 'batch', from: null, to: `${batch.quantity} ${batch.unit} ${batch.menuItemName}` }] });
  res.status(201).json({ batch });
}

// PATCH /api/batches/:batchId/status   body: { status }: planned -> started -> completed, or planned -> cancelled
export async function updateBatchStatus(req, res) {
  const batch = await CookingBatch.findById(req.params.batchId);
  if (!batch) throw httpError(404, 'Batch not found');
  await findEditableEvent(batch.event, req.user);

  const next = req.body.status;
  if (!BATCH_TRANSITIONS[batch.status].includes(next)) {
    throw httpError(409, `A ${batch.status} batch cannot become ${next}`);
  }
  const timestamps = next === 'started' ? { startedAt: new Date() } : next === 'completed' ? { completedAt: new Date() } : {};
  // Guarded: only changes the batch if its status is still what we just checked.
  const updated = await CookingBatch.findOneAndUpdate(
    { _id: batch._id, status: batch.status },
    { status: next, ...timestamps },
    { returnDocument: 'after' }
  );
  if (!updated) throw httpError(409, 'This batch was changed by someone else. Reload and try again.');

  await logAudit({ actor: req.user, action: 'batch.status', entityType: 'event', entityId: batch.event, changes: [{ field: `${batch.menuItemName} batch`, from: batch.status, to: next }] });
  res.json({ batch: updated });
}

// POST /api/events/:id/food-plan/suggest   body: { attendance }: nothing is saved
export async function suggestFoodPlan(req, res) {
  const event = await findEditableEvent(req.params.id, req.user);
  const batches = await CookingBatch.find({ event: event._id });
  res.json(suggestAdjustments(event.menu, batches, req.body.attendance));
}

// POST /api/events/:id/food-plan/apply   body: { attendance, adjustments, reason }
// Each change is a guarded update: it only applies if the batch is STILL planned with the SAME
// quantity the host saw. A batch that started cooking meanwhile is skipped, never changed.
export async function applyFoodPlan(req, res) {
  const event = await findEditableEvent(req.params.id, req.user);
  const applied = [];
  const skipped = [];

  for (const change of req.body.adjustments) {
    if (change.type === 'add') {
      const item = event.menu.id(change.menuItemId);
      if (!item) {
        skipped.push({ ...change, why: 'Dish no longer on the menu' });
        continue;
      }
      await CookingBatch.create({
        event: event._id, menuItemId: item._id, menuItemName: item.name, quantity: change.quantity,
        unit: item.unit, note: `Added for ${req.body.attendance} guests`, createdBy: req.user._id,
      });
      applied.push(change);
      continue;
    }

    const update = change.type === 'update' ? { quantity: change.to } : { status: 'cancelled', note: 'Cancelled by plan adjustment' };
    const batch = await CookingBatch.findOneAndUpdate(
      { _id: change.batchId, event: event._id, status: 'planned', quantity: change.from },
      update,
      { returnDocument: 'after' }
    );
    if (batch) applied.push(change);
    else skipped.push({ ...change, why: 'Batch already started, completed or changed by someone else' });
  }

  await logAudit({
    actor: req.user, action: 'event.food_plan_adjust', entityType: 'event', entityId: event._id,
    changes: [{ field: 'cooking batches', from: null, to: `${applied.length} change(s) applied, ${skipped.length} skipped` }],
    reason: `Attendance ${req.body.attendance}${req.body.reason ? `: ${req.body.reason}` : ''}`,
  });
  res.json({ applied, skipped });
}
