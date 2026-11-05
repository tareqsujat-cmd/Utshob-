import { Router } from 'express';
import * as admin from '../controllers/admin.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  approvalDecisionSchema,
  auditQuerySchema,
  userListQuerySchema,
  settingSchema,
} from '../validators/admin.schemas.js';

const router = Router();

// Every route in this file is admin-only, so the check is applied once for the whole router.
router.use(requireAuth, requireRole('admin'));

router.get('/approvals', admin.listPendingApprovals);
router.get('/users', validate(userListQuerySchema, 'query'), admin.listUsers);
router.patch('/users/:id/approval', validate(approvalDecisionSchema), admin.decideUserApproval);
router.get('/audit-logs', validate(auditQuerySchema, 'query'), admin.listAuditLogs);
router.get('/settings', admin.listSettings);
router.patch('/settings/:key', validate(settingSchema), admin.updateSetting);
router.post('/demo/reset', admin.resetDemo);

export default router;
