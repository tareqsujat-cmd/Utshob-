import { Budget } from '../models/Budget.js';
import { User } from '../models/User.js';
import { BUDGET_CATEGORY_LABELS } from '../config/constants.js';
import { findEventForUser, findEditableEvent } from '../services/event.service.js';
import {
  createScenario, emptyLines, saveNewVersion, committedCosts, buildBudgetSummary,
} from '../services/budget.service.js';
import { assertWithinLimit, getEffectivePlan } from '../services/plan.service.js';
import { logAudit } from '../services/audit.service.js';
import { httpError } from '../utils/httpError.js';

// Limits come from the plan of the event OWNER (the account that pays).
const ownerOf = (event) => User.findById(event.owner);

// GET /api/events/:id/budgets: all scenarios with their version history
export async function listBudgets(req, res) {
  const event = await findEventForUser(req.params.id, req.user);
  const budgets = await Budget.find({ event: event._id })
    .sort({ isPrimary: -1, createdAt: 1 })
    .populate('versions.changedBy', 'name');
  const plan = await getEffectivePlan(await ownerOf(event));
  res.json({ budgets, scenarioLimit: plan.limits.budgetScenarios, planName: plan.name });
}

// POST /api/events/:id/budgets   body: { name, copyFrom? }: a new scenario (limited by plan)
export async function createBudgetScenario(req, res) {
  const event = await findEditableEvent(req.params.id, req.user);
  const count = await Budget.countDocuments({ event: event._id });
  await assertWithinLimit(await ownerOf(event), 'budgetScenarios', count);

  let lines = emptyLines();
  if (req.body.copyFrom) {
    const source = await Budget.findOne({ _id: req.body.copyFrom, event: event._id });
    if (!source) throw httpError(404, 'Scenario to copy not found');
    lines = source.lines;
  }
  if (await Budget.exists({ event: event._id, name: req.body.name })) {
    throw httpError(409, 'A scenario with this name already exists');
  }

  const budget = await createScenario({
    eventId: event._id, name: req.body.name, isPrimary: false, lines,
    user: req.user, reason: 'Scenario created', source: 'initial',
  });
  await logAudit({ actor: req.user, action: 'budget.create', entityType: 'budget', entityId: budget._id, changes: [{ field: 'scenario', from: null, to: budget.name }] });
  res.status(201).json({ budget });
}

// PATCH /api/budgets/:budgetId   body: { lines, reason, version }: saves a NEW version
export async function updateBudget(req, res) {
  const budget = await Budget.findById(req.params.budgetId);
  if (!budget) throw httpError(404, 'Budget not found');
  await findEditableEvent(budget.event, req.user);

  const updated = await saveNewVersion(budget._id, req.body.version, req.body.lines, {
    user: req.user, reason: req.body.reason, source: 'manual',
  });

  // One audit change per category whose amount changed.
  const changes = updated.lines
    .map((line) => {
      const old = budget.lines.find((l) => l.category === line.category)?.estimated ?? 0;
      return { field: `${budget.name}: ${BUDGET_CATEGORY_LABELS[line.category]}`, from: old, to: line.estimated };
    })
    .filter((c) => c.from !== c.to);
  await logAudit({ actor: req.user, action: 'budget.update', entityType: 'budget', entityId: budget._id, changes, reason: req.body.reason });

  res.json({ budget: updated });
}

// PATCH /api/budgets/:budgetId/primary: this scenario drives alerts and reports
export async function makePrimary(req, res) {
  const budget = await Budget.findById(req.params.budgetId);
  if (!budget) throw httpError(404, 'Budget not found');
  await findEditableEvent(budget.event, req.user);

  await Budget.updateMany({ event: budget.event, _id: { $ne: budget._id } }, { isPrimary: false });
  await Budget.updateOne({ _id: budget._id }, { isPrimary: true });
  await logAudit({ actor: req.user, action: 'budget.primary', entityType: 'budget', entityId: budget._id, changes: [{ field: 'primary scenario', from: null, to: budget.name }] });
  res.json({ ok: true });
}

// GET /api/events/:id/budget-summary: estimate vs quotes vs spending, with alerts
export async function getBudgetSummary(req, res) {
  const event = await findEventForUser(req.params.id, req.user);
  const budget = await Budget.findOne({ event: event._id, isPrimary: true });
  if (!budget) throw httpError(404, 'This event has no primary budget');
  const summary = buildBudgetSummary(event, budget, await committedCosts(event._id));
  res.json({ ...summary, budgetId: budget._id, scenarioName: budget.name, version: budget.version });
}
