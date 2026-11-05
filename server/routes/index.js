import { Router } from 'express';
import authRoutes from './auth.routes.js';
import adminRoutes from './admin.routes.js';
import { usersRouter, organizationsRouter } from './users.routes.js';
import { metaRouter, dashboardRouter, notificationsRouter } from './common.routes.js';

// The whole API in one place: every URL prefix and the router that handles it.
const api = Router();

api.get('/health', (req, res) => res.json({ ok: true, time: new Date() }));

// Common workflows
api.use('/meta', metaRouter);
api.use('/auth', authRoutes);
api.use('/users', usersRouter);
api.use('/organizations', organizationsRouter);
api.use('/notifications', notificationsRouter);
api.use('/dashboard', dashboardRouter);
api.use('/admin', adminRoutes);

export default api;
