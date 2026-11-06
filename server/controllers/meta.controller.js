import * as C from '../config/constants.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { DEMO_PASSWORD } from '../seed/data/users.js';

// GET /api/meta: every fixed list the client needs for dropdowns and labels.
// Features add their own lists here, so React never hardcodes them.
export function getMeta(req, res) {
  res.json({
    demoMode: env.demoMode,
    // common
    roles: C.ROLES,
    roleLabels: C.ROLE_LABELS,
    signupRoles: C.SIGNUP_ROLES,
    divisions: C.DIVISIONS,
    divisionCenters: C.DIVISION_CENTERS,
    organizationTypes: C.ORGANIZATION_TYPES,
    // M1-B providers
    providerCategories: C.PROVIDER_CATEGORIES,
    providerCategoryLabels: C.PROVIDER_CATEGORY_LABELS,
    credentialTypes: C.CREDENTIAL_TYPES,
    credentialLabels: C.CREDENTIAL_LABELS,
    requiredCredentials: C.REQUIRED_CREDENTIALS,
    providerTags: C.PROVIDER_TAGS,
    providerTagLabels: C.PROVIDER_TAG_LABELS,
    upload: { mimeTypes: C.UPLOAD_MIME_TYPES, maxBytes: C.UPLOAD_MAX_BYTES },
    // M1-A events
    eventTypes: C.EVENT_TYPES,
    eventTypeLabels: C.EVENT_TYPE_LABELS,
    eventStatuses: C.EVENT_STATUSES,
    budgetCategories: C.BUDGET_CATEGORIES,
    budgetCategoryLabels: C.BUDGET_CATEGORY_LABELS,
    requiredServices: C.REQUIRED_SERVICES,
    serviceLabels: C.SERVICE_LABELS,
    foodUnits: C.FOOD_UNITS,
    menuCourses: C.MENU_COURSES,
    dietaryLabels: C.DIETARY_LABELS,
    batchTransitions: C.BATCH_TRANSITIONS,
    invitationPalettes: C.INVITATION_PALETTES,
    invitationFonts: C.INVITATION_FONTS,
    invitationLayouts: C.INVITATION_LAYOUTS,
    // M1-C surplus
    allergens: C.ALLERGENS,
    allergenLabels: C.ALLERGEN_LABELS,
    storageConditions: C.STORAGE_CONDITIONS,
    storageLabels: C.STORAGE_LABELS,
    packagingTypes: C.PACKAGING_TYPES,
    packagingLabels: C.PACKAGING_LABELS,
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
