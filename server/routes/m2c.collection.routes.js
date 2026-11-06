import { Router } from 'express';
import * as tasks from '../controllers/m2c.tasks.controller.js';
import * as telegram from '../controllers/m2c.telegram.controller.js';
import { requireAuth, requireRole, requireApproved } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as s from '../validators/m2c.collection.schemas.js';

// M2-C Collection logistics + Telegram. All URLs of this feature, written out in full.
// Which task a user may touch (own organization / assigned volunteer) is checked in the controller.
const coordinators = [requireAuth, requireRole('orphanage_coordinator', 'outreach_coordinator'), requireApproved];
const taskPeople = [requireAuth, requireRole('orphanage_coordinator', 'outreach_coordinator', 'volunteer', 'admin'), requireApproved];

export const collectionRouter = Router();
collectionRouter.get('/volunteers', coordinators, validate(s.volunteerQuerySchema, 'query'), tasks.listVolunteers);
collectionRouter.post('/reservations/:id/tasks', coordinators, validate(s.assignSchema), tasks.assignCollector);
collectionRouter.get('/tasks', taskPeople, tasks.listTasks);
collectionRouter.patch('/tasks/:id/status', taskPeople, validate(s.taskStatusSchema), tasks.updateTaskStatus);
collectionRouter.post('/tasks/reminders/send-due', [requireAuth, requireRole('orphanage_coordinator', 'outreach_coordinator', 'admin')], tasks.sendRemindersNow);
collectionRouter.get('/cron/reminders', tasks.cronReminders); // Vercel Cron (secret header)
collectionRouter.post('/notifications/:id/retry', [requireAuth, requireRole('orphanage_coordinator', 'outreach_coordinator', 'admin')], tasks.retryTelegram);

// Any logged-in user can connect their own Telegram.
collectionRouter.get('/telegram/status', requireAuth, telegram.status);
collectionRouter.post('/telegram/link', requireAuth, telegram.createLinkCode);
collectionRouter.post('/telegram/verify', requireAuth, telegram.verifyLink);
collectionRouter.delete('/telegram/link', requireAuth, telegram.unlink);
