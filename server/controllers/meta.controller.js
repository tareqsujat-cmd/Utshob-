import { ROLES, ROLE_LABELS, SIGNUP_ROLES, DIVISIONS, ORGANIZATION_TYPES } from '../config/constants.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { DEMO_PASSWORD } from '../seed/data/users.js';

// GET /api/meta: every fixed list the client needs for dropdowns.
// Features add their own lists here (units, categories ...).
export function getMeta(req, res) {
  res.json({
    demoMode: env.demoMode,
    roles: ROLES,
    roleLabels: ROLE_LABELS,
    signupRoles: SIGNUP_ROLES,
    divisions: DIVISIONS,
    organizationTypes: ORGANIZATION_TYPES,
  });
}

// GET /api/meta/demo-accounts: only in demo mode. Lists the seeded demo accounts
// (read from the database) so graders can log in as any role with one click.
export async function getDemoAccounts(req, res) {
  if (!env.demoMode) return res.json({ accounts: [], password: null });
  const accounts = await User.find({ email: /@utshob\.demo$/ })
    .select('name email role approvalStatus')
    .sort({ role: 1, email: 1 })
    .lean();
  res.json({ accounts, password: DEMO_PASSWORD });
}
