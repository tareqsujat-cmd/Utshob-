import { Router } from 'express';
import * as users from '../controllers/users.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updateProfileSchema, changePasswordSchema, updateOrganizationSchema } from '../validators/users.schemas.js';

// Profile routes (/api/users) and the coordinator's own organization (/api/organizations).
export const usersRouter = Router();
usersRouter.patch('/me', requireAuth, validate(updateProfileSchema), users.updateMe);
usersRouter.patch('/me/password', requireAuth, validate(changePasswordSchema), users.changePassword);

export const organizationsRouter = Router();
const coordinatorsOnly = [requireAuth, requireRole('orphanage_coordinator', 'outreach_coordinator')];
organizationsRouter.get('/mine', coordinatorsOnly, users.getMyOrganization);
organizationsRouter.patch('/mine', coordinatorsOnly, validate(updateOrganizationSchema), users.updateMyOrganization);
