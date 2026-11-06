import { Expense } from '../models/Expense.js';
import { Contribution } from '../models/Contribution.js';
import { User } from '../models/User.js';
import { findEventForUser, isOrganizer } from '../services/event.service.js';
import { computeSplitSummary } from '../services/split.service.js';
import { receiveCash, statusFor } from '../services/contribution.service.js';
import { startPayment } from '../services/payment.service.js';
import { isConfigured as paymentsConfigured } from '../services/sslcommerz.service.js';
import { assertFeature } from '../services/plan.service.js';
import { logAudit, diffFields } from '../services/audit.service.js';
import { httpError } from '../utils/httpError.js';

// Money can be recorded for an event in any status (costs also come after the event,
// or after a cancellation), but only by its organizers. Admins may only look.
async function eventForMoney(eventId, user, { write = false } = {}) {
  const event = await findEventForUser(eventId, user);
  if (write && !isOrganizer(event, user)) throw httpError(403, 'Only organizers can change the money records');
  return event;
}

// Plan features are checked against the plan of the event's OWNER (the account that pays).
const ownerOf = (event) => User.findById(event.owner);

async function contributionForUser(id, user, options) {
  const contribution = await Contribution.findById(id);
  if (!contribution) throw httpError(404, 'Contribution not found');
  const event = await eventForMoney(contribution.event, user, options);
  return { contribution, event };
}

// ---------------- Expenses ----------------

// GET /api/events/:id/expenses
export async function listExpenses(req, res) {
  const event = await eventForMoney(req.params.id, req.user);
  const expenses = await Expense.find({ event: event._id }).sort({ date: -1, createdAt: -1 });
  const recorded = expenses.filter((e) => e.status === 'recorded');
  const byCategory = {};
  for (const e of recorded) byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  res.json({ expenses, total: recorded.reduce((s, e) => s + e.amount, 0), byCategory });
}

// POST /api/events/:id/expenses
export async function createExpense(req, res) {
  const event = await eventForMoney(req.params.id, req.user, { write: true });
  const expense = await Expense.create({ ...req.body, event: event._id, createdBy: req.user._id });
  await logAudit({ actor: req.user, action: 'expense.create', entityType: 'event', entityId: event._id, changes: [{ field: 'expense', from: null, to: `${expense.description}: ৳${expense.amount}` }] });
  res.status(201).json({ expense });
}

// PATCH /api/expenses/:id
export async function updateExpense(req, res) {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw httpError(404, 'Expense not found');
  await eventForMoney(expense.event, req.user, { write: true });
  if (expense.status === 'void') throw httpError(409, 'A void expense cannot be changed');

  const before = expense.toObject();
  expense.set(req.body);
  await expense.save();
  const changes = diffFields(before, expense.toObject(), ['category', 'description', 'amount', 'date', 'paidByName', 'paidByGroup']);
  await logAudit({ actor: req.user, action: 'expense.update', entityType: 'event', entityId: expense.event, changes });
  res.json({ expense });
}

// POST /api/expenses/:id/void   body: { reason }: kept for history, no longer counted
export async function voidExpense(req, res) {
  const existing = await Expense.findById(req.params.id);
  if (!existing) throw httpError(404, 'Expense not found');
  await eventForMoney(existing.event, req.user, { write: true });

  const expense = await Expense.findOneAndUpdate(
    { _id: existing._id, status: 'recorded' },
    { status: 'void', voidReason: req.body.reason },
    { returnDocument: 'after' }
  );
  if (!expense) throw httpError(409, 'This expense is already void');
  await logAudit({ actor: req.user, action: 'expense.void', entityType: 'event', entityId: expense.event, changes: [{ field: expense.description, from: expense.amount, to: 'void' }], reason: req.body.reason });
  res.json({ expense });
}

// ---------------- Cost split ----------------

// PUT /api/events/:id/split   body: { method, groups }
export async function setSplit(req, res) {
  const event = await eventForMoney(req.params.id, req.user, { write: true });
  const { method, groups } = req.body;

  // Equal splitting is free; percentage and custom amounts need the Plus plan or above.
  if (method !== 'equal') await assertFeature(await ownerOf(event), 'customSplits');

  if (method === 'custom') {
    const expenses = await Expense.find({ event: event._id, status: 'recorded' });
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const assigned = groups.reduce((s, g) => s + (g.fixedAmount || 0), 0);
    if (assigned !== total) throw httpError(400, `Custom amounts add up to ৳${assigned}, but expenses total ৳${total}`);
  }

  const before = event.costSplit ? event.toObject().costSplit : null;
  event.costSplit = { method, groups };
  await event.save();
  await logAudit({ actor: req.user, action: 'event.split', entityType: 'event', entityId: event._id, changes: [{ field: 'cost split', from: before?.method || null, to: `${method}: ${groups.map((g) => g.name).join(', ')}` }] });
  res.json({ costSplit: event.costSplit });
}

// GET /api/events/:id/split-summary: who should pay what, and what is still outstanding
export async function getSplitSummary(req, res) {
  const event = await eventForMoney(req.params.id, req.user);
  const [expenses, contributions] = await Promise.all([
    Expense.find({ event: event._id }),
    Contribution.find({ event: event._id }),
  ]);
  res.json(computeSplitSummary(event, expenses, contributions));
}

// ---------------- Contributions ----------------

// GET /api/events/:id/contributions
export async function listContributions(req, res) {
  const event = await eventForMoney(req.params.id, req.user);
  const contributions = await Contribution.find({ event: event._id }).sort({ createdAt: -1 });
  const active = contributions.filter((c) => c.status !== 'cancelled');
  const money = active.filter((c) => c.type !== 'in_kind');
  const goods = active.filter((c) => c.type === 'in_kind');
  res.json({
    contributions,
    totals: {
      pledged: money.reduce((s, c) => s + c.amountPledged, 0), // promised
      received: money.reduce((s, c) => s + c.amountReceived, 0), // actually in hand
      outstanding: money.reduce((s, c) => s + (c.amountPledged - c.amountReceived), 0),
      inKindEstimatedValue: goods.reduce((s, c) => s + c.inKind.estimatedValue, 0),
    },
    paymentsEnabled: paymentsConfigured(),
  });
}

// POST /api/events/:id/contributions
export async function createContribution(req, res) {
  const event = await eventForMoney(req.params.id, req.user, { write: true });
  if (req.body.type === 'sponsorship') await assertFeature(await ownerOf(event), 'sponsorshipOffers');

  const contribution = await Contribution.create({
    ...req.body,
    amountPledged: req.body.type === 'in_kind' ? 0 : req.body.amountPledged,
    event: event._id,
    createdBy: req.user._id,
  });
  await logAudit({ actor: req.user, action: 'contribution.create', entityType: 'event', entityId: event._id, changes: [{ field: 'contribution', from: null, to: `${contribution.contributorName} (${contribution.type})` }] });
  res.status(201).json({ contribution });
}

// PATCH /api/contributions/:id: edit the pledge (never below what was already received)
export async function updateContribution(req, res) {
  const { contribution, event } = await contributionForUser(req.params.id, req.user, { write: true });
  if (contribution.status === 'cancelled') throw httpError(409, 'This contribution is cancelled');
  if (req.body.type !== contribution.type) throw httpError(400, 'The type of a contribution cannot change; create a new one');
  if (req.body.amountPledged < contribution.amountReceived) {
    throw httpError(409, `The pledge can't be lower than what was already received (৳${contribution.amountReceived})`);
  }
  if (contribution.type === 'in_kind' && req.body.inKind.quantity < contribution.inKind.receivedQuantity) {
    throw httpError(409, `The quantity can't be lower than what was already received (${contribution.inKind.receivedQuantity})`);
  }

  const before = contribution.toObject(); // plain copy (inKind and sponsorship are nested objects)
  contribution.set({
    contributorName: req.body.contributorName,
    contributorPhone: req.body.contributorPhone,
    group: req.body.group,
    amountPledged: contribution.type === 'in_kind' ? 0 : req.body.amountPledged,
    ...(req.body.inKind && { inKind: { ...before.inKind, ...req.body.inKind } }),
    ...(req.body.sponsorship && { sponsorship: { ...before.sponsorship, ...req.body.sponsorship } }),
  });
  contribution.status = statusFor(contribution);
  await contribution.save();
  const changes = diffFields(before, contribution.toObject(), ['contributorName', 'group', 'amountPledged']);
  await logAudit({ actor: req.user, action: 'contribution.update', entityType: 'event', entityId: event._id, changes });
  res.json({ contribution });
}

// POST /api/contributions/:id/receive   body: { amount } (cash/sponsorship) or { quantity } (in kind)
export async function receiveContribution(req, res) {
  const { contribution, event } = await contributionForUser(req.params.id, req.user, { write: true });
  let updated;

  if (contribution.type === 'in_kind') {
    const quantity = req.body.quantity;
    if (!quantity) throw httpError(400, 'Enter the quantity received');
    // Guarded: never more goods received than were pledged.
    updated = await Contribution.findOneAndUpdate(
      { _id: contribution._id, status: { $ne: 'cancelled' }, $expr: { $lte: [{ $add: ['$inKind.receivedQuantity', quantity] }, '$inKind.quantity'] } },
      { $inc: { 'inKind.receivedQuantity': quantity }, $push: { receipts: { quantity, method: 'in_kind', recordedBy: req.user._id, note: req.body.note, at: new Date() } } },
      { returnDocument: 'after' }
    );
    if (updated) {
      updated.status = statusFor(updated);
      await updated.save();
    }
  } else {
    if (!req.body.amount) throw httpError(400, 'Enter the amount received');
    updated = await receiveCash(contribution._id, { amount: req.body.amount, method: 'manual_cash', user: req.user._id, note: req.body.note });
  }

  if (!updated) {
    const left = contribution.type === 'in_kind'
      ? `${contribution.inKind.quantity - contribution.inKind.receivedQuantity} ${contribution.inKind.unit}`
      : `৳${contribution.amountPledged - contribution.amountReceived}`;
    throw httpError(409, `That is more than what is still pledged (${left}). Increase the pledge first.`);
  }
  await logAudit({ actor: req.user, action: 'contribution.receive', entityType: 'event', entityId: event._id, changes: [{ field: `${contribution.contributorName} received`, from: contribution.type === 'in_kind' ? contribution.inKind.receivedQuantity : contribution.amountReceived, to: contribution.type === 'in_kind' ? updated.inKind.receivedQuantity : updated.amountReceived }] });
  res.json({ contribution: updated });
}

// POST /api/contributions/:id/checkout   body: { amount }: pay online through the sandbox gateway
export async function checkoutContribution(req, res) {
  const { contribution, event } = await contributionForUser(req.params.id, req.user, { write: true });
  if (contribution.type === 'in_kind') throw httpError(400, 'Goods are not paid online');
  if (contribution.status === 'cancelled') throw httpError(409, 'This contribution is cancelled');
  const left = contribution.amountPledged - contribution.amountReceived;
  if (req.body.amount > left) throw httpError(400, `Only ৳${left} is still pledged`);

  const { payment, gatewayUrl } = await startPayment({
    purpose: 'contribution',
    refId: contribution._id,
    user: req.user,
    amount: req.body.amount,
    description: `Contribution from ${contribution.contributorName} for ${event.title}`,
    returnTo: `/events/${event._id}/contributions`,
  });
  res.json({ tranId: payment.tranId, gatewayUrl });
}

// PATCH /api/contributions/:id/fulfilment: Pro plan: track what a sponsor delivered
export async function updateFulfilment(req, res) {
  const { contribution, event } = await contributionForUser(req.params.id, req.user, { write: true });
  if (contribution.type !== 'sponsorship') throw httpError(400, 'Only sponsorships have fulfilment tracking');
  await assertFeature(await ownerOf(event), 'sponsorshipTracking');

  const from = contribution.sponsorship.fulfilmentStatus;
  contribution.sponsorship.fulfilmentStatus = req.body.fulfilmentStatus;
  contribution.sponsorship.fulfilmentNotes = req.body.fulfilmentNotes;
  await contribution.save();
  await logAudit({ actor: req.user, action: 'sponsorship.fulfilment', entityType: 'event', entityId: event._id, changes: [{ field: contribution.sponsorship.sponsorName, from, to: req.body.fulfilmentStatus }] });
  res.json({ contribution });
}

// POST /api/contributions/:id/cancel   body: { reason }: only if nothing was received yet
export async function cancelContribution(req, res) {
  const { contribution, event } = await contributionForUser(req.params.id, req.user, { write: true });
  const updated = await Contribution.findOneAndUpdate(
    { _id: contribution._id, status: 'pledged', amountReceived: 0, 'inKind.receivedQuantity': { $in: [0, null] } },
    { status: 'cancelled', cancelReason: req.body.reason },
    { returnDocument: 'after' }
  );
  if (!updated) throw httpError(409, 'Only a pledge with nothing received yet can be cancelled');
  await logAudit({ actor: req.user, action: 'contribution.cancel', entityType: 'event', entityId: event._id, changes: [{ field: contribution.contributorName, from: 'pledged', to: 'cancelled' }], reason: req.body.reason });
  res.json({ contribution: updated });
}
