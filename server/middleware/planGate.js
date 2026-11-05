import { assertFeature } from '../services/plan.service.js';

// Route-level version of assertFeature: router.get('/x.csv', requireAuth, requirePlanFeature('downloadableReports'), ...)
export function requirePlanFeature(featureName) {
  return async (req, res, next) => {
    await assertFeature(req.user, featureName);
    next();
  };
}
