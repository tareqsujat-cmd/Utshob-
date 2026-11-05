import { Router } from 'express';
import { getMeta, getDemoAccounts } from '../controllers/meta.controller.js';
import { getDashboard } from '../controllers/dashboard.controller.js';
import * as notifications from '../controllers/notifications.controller.js';
import { requireAuth } from '../middleware/auth.js';

// Small shared routes: /api/meta, /api/dashboard, /api/notifications
export const metaRouter = Router();
metaRouter.get('/', getMeta);
metaRouter.get('/demo-accounts', getDemoAccounts);

export const dashboardRouter = Router();
dashboardRouter.get('/', requireAuth, getDashboard);

export const notificationsRouter = Router();
notificationsRouter.get('/', requireAuth, notifications.listMine);
notificationsRouter.patch('/read-all', requireAuth, notifications.markAllRead);
notificationsRouter.patch('/:id/read', requireAuth, notifications.markRead);
