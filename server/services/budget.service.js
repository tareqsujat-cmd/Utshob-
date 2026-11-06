import mongoose from 'mongoose';
import { Budget } from '../models/Budget.js';
import { Expense } from '../models/Expense.js';
import {
  BUDGET_CATEGORIES, BUDGET_CATEGORY_LABELS, SERVICE_BUDGET_CATEGORY, SERVICE_LABELS,
} from '../config/constants.js';
import { httpError } from '../utils/httpError.js';

const taka = (n) => `৳${Math.round(n).toLocaleString('en-IN')}`;

export function totalOf(lines) {
  return lines.reduce((sum, line) => sum + line.estimated, 0);
}

// One line per category, all zero: the starting point of a new budget.
export function emptyLines() {
  return BUDGET_CATEGORIES.map((category) => ({ category, estimated: 0, note: '' }));
}

// Make sure a budget always has exactly one line per category, in the standard order.
export function normalizeLines(lines) {
  return BUDGET_CATEGORIES.map((category) => {
    const line = lines.find((l) => l.category === category);
    return { category, estimated: line ? line.estimated : 0, note: line?.note || '' };
  });
}

// Create a budget scenario with its first version.
export function createScenario({ eventId, name, isPrimary, lines, user, reason, source }) {
  const clean = normalizeLines(lines);
  return Budget.create({
    event: eventId,
    name,
    isPrimary,
    version: 1,
    lines: clean,
    versions: [{ version: 1, lines: clean, total: totalOf(clean), changedBy: user._id, reason, source }],
  });
}

// Save new lines as the NEXT version, but only if nobody saved in between (optimistic concurrency):
// the filter requires the version the user started from. Used by manual edits, AI (M3-A)
// and quote approval (M3-C).
export async function saveNewVersion(budgetId, expectedVersion, lines, { user, reason, source }) {
  const clean = normalizeLines(lines);
  const updated = await Budget.findOneAndUpdate(
    { _id: budgetId, version: expectedVersion },
    {
      $set: { lines: clean },
      $inc: { version: 1 },
      $push: {
        versions: { version: expectedVersion + 1, lines: clean, total: totalOf(clean), changedBy: user._id, reason, source },
      },
    },
    { returnDocument: 'after' }
  );
  if (!updated) throw httpError(409, 'Someone else changed this budget meanwhile. Reload to see the latest version.');
  return updated;
}

// Money already committed per category by other features: { food: 50000, venue: 70000 }.
// `expenses` comes from M2-A (recorded, not void). M3-C fills `quotes` (approved quotations).
export async function committedCosts(eventId) {
  const rows = await Expense.aggregate([
    { $match: { event: new mongoose.Types.ObjectId(String(eventId)), status: 'recorded' } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
  ]);
  const expenses = {};
  for (const row of rows) expenses[row._id] = row.total;
  return { quotes: {}, expenses };
}

// The budget overview for one event: per category estimate vs approved quotes vs spending,
// plus alerts the host should see (over budget, missing charges, money not allocated).
export function buildBudgetSummary(event, budget, committed) {
  const rows = BUDGET_CATEGORIES.map((category) => {
    const estimated = budget.lines.find((l) => l.category === category)?.estimated || 0;
    const quoted = committed.quotes[category] || 0;
    const spent = committed.expenses[category] || 0;
    // What we currently expect to pay: the highest of the three numbers.
    return { category, estimated, quoted, spent, expected: Math.max(estimated, quoted, spent) };
  });

  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  const totals = { estimated: sum('estimated'), quoted: sum('quoted'), spent: sum('spent'), expected: sum('expected') };
  const alerts = [];

  if (totals.estimated > event.budgetTotal) {
    alerts.push({
      level: 'danger',
      code: 'over_budget',
      message: `Estimated costs (${taka(totals.estimated)}) are ${taka(totals.estimated - event.budgetTotal)} over your budget of ${taka(event.budgetTotal)}.`,
    });
  } else if (totals.expected > event.budgetTotal) {
    alerts.push({
      level: 'danger',
      code: 'over_budget_committed',
      message: `With approved quotes and expenses you expect to pay ${taka(totals.expected)}, ${taka(totals.expected - event.budgetTotal)} over budget.`,
    });
  }

  for (const row of rows) {
    const label = BUDGET_CATEGORY_LABELS[row.category];
    if (row.quoted > row.estimated) {
      alerts.push({ level: 'warning', code: 'quote_over_estimate', message: `${label}: approved quotes (${taka(row.quoted)}) are ${taka(row.quoted - row.estimated)} above the estimate.` });
    }
    if (row.spent > row.estimated) {
      alerts.push({ level: 'warning', code: 'spent_over_estimate', message: `${label}: expenses (${taka(row.spent)}) are ${taka(row.spent - row.estimated)} above the estimate.` });
    }
  }

  // Missing charges: the event needs a service, but nothing is budgeted or quoted for it.
  for (const service of event.requiredServices) {
    const row = rows.find((r) => r.category === SERVICE_BUDGET_CATEGORY[service]);
    if (row.estimated === 0 && row.quoted === 0) {
      alerts.push({
        level: 'warning',
        code: 'missing_charge',
        message: `Missing charge: the event needs ${SERVICE_LABELS[service].toLowerCase()}, but the ${BUDGET_CATEGORY_LABELS[row.category].toLowerCase()} line is empty.`,
      });
    }
  }

  const unallocated = event.budgetTotal - totals.expected;
  if (unallocated > 0) {
    alerts.push({ level: 'info', code: 'unallocated', message: `${taka(unallocated)} of your budget is not allocated yet.` });
  }

  return { budgetTotal: event.budgetTotal, rows, totals, remaining: event.budgetTotal - totals.expected, alerts };
}
