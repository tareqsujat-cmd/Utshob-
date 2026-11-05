import { ROLES, ROLE_LABELS, SIGNUP_ROLES, DIVISIONS, ORGANIZATION_TYPES } from '../config/constants.js';

// GET /api/meta: every fixed list the client needs for dropdowns.
// Features add their own lists here (units, categories ...).
export function getMeta(req, res) {
  res.json({
    roles: ROLES,
    roleLabels: ROLE_LABELS,
    signupRoles: SIGNUP_ROLES,
    divisions: DIVISIONS,
    organizationTypes: ORGANIZATION_TYPES,
  });
}
