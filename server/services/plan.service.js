import { Plan } from '../models/Plan.js';
import { httpError } from '../utils/httpError.js';

const LIMIT_LABELS = {
  activeEvents: 'active events',
  organizers: 'organizers per event',
  aiRequestsPerMonth: 'AI requests per month',
  budgetScenarios: 'budget scenarios per event',
  branches: 'branches',
};

export async function getAllPlans() {
  return Plan.find().sort({ sortOrder: 1 }).lean();
}

// Which plan is this user on right now?
// Until subscriptions exist (M3-D), every account is on Starter.
export async function getEffectivePlan(user) {
  const starter = await Plan.findOne({ code: 'starter' }).lean();
  if (!starter) throw httpError(500, 'Plans are missing. Run "npm run seed".');
  return starter;
}

// The cheapest plan that passes `test`, used to tell the user what to upgrade to.
async function cheapestPlanWhere(test) {
  const plans = await getAllPlans();
  return plans.find(test) || null;
}

// Throws 402 if adding one more item would go over the plan limit.
// Example: await assertWithinLimit(user, 'activeEvents', currentActiveCount)
export async function assertWithinLimit(user, limitName, currentCount) {
  const plan = await getEffectivePlan(user);
  const limit = plan.limits[limitName];
  if (currentCount < limit) return plan;

  const upgrade = await cheapestPlanWhere((p) => p.limits[limitName] > limit);
  throw httpError(
    402,
    `Your ${plan.name} plan allows ${limit} ${LIMIT_LABELS[limitName]}.` +
      (upgrade ? ` Upgrade to ${upgrade.name} for more.` : ''),
    undefined,
    { upgradeTo: upgrade?.code, limit, limitName }
  );
}

// Throws 402 if the user's plan does not include a feature (e.g. 'customSplits').
export async function assertFeature(user, featureName) {
  const plan = await getEffectivePlan(user);
  if (plan.features[featureName]) return plan;

  const upgrade = await cheapestPlanWhere((p) => p.features[featureName]);
  throw httpError(
    402,
    `This feature needs the ${upgrade ? upgrade.name : 'a higher'} plan (you are on ${plan.name}).`,
    undefined,
    { upgradeTo: upgrade?.code, feature: featureName }
  );
}
