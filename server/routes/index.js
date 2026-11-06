import { Router } from 'express';
import authRoutes from './auth.routes.js';
import adminRoutes from './admin.routes.js';
import { usersRouter, organizationsRouter } from './users.routes.js';
import { metaRouter, dashboardRouter, notificationsRouter } from './common.routes.js';
import { providersRouter, filesRouter, adminCredentialsRouter } from './m1b.providers.routes.js';
import { eventsRouter, budgetsRouter, batchesRouter, publicRouter } from './m1a.events.routes.js';
import { surplusRouter, foodRequestsRouter, reservationsRouter } from './m1c.surplus.routes.js';
import { moneyRouter } from './m2a.money.routes.js';
import { paymentsRouter } from './payments.routes.js';
import { geoRouter, providerSearchRouter } from './m2b.search.routes.js';
import { collectionRouter } from './m2c.collection.routes.js';

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
api.use('/admin/credentials', adminCredentialsRouter); // before /admin (more specific path first)
api.use('/admin', adminRoutes);

// Module 1
api.use('/events', eventsRouter); // M1-A
api.use('/budgets', budgetsRouter); // M1-A
api.use('/batches', batchesRouter); // M1-A
api.use('/public', publicRouter); // M1-A invitations (no login)
api.use('/providers', providersRouter); // M1-B
api.use('/files', filesRouter); // M1-B uploaded documents
api.use('/surplus', surplusRouter); // M1-C
api.use('/food-requests', foodRequestsRouter); // M1-C
api.use('/reservations', reservationsRouter); // M1-C

// Module 2
api.use('/payments', paymentsRouter); // shared sandbox checkout (SSLCOMMERZ)
api.use('/geo', geoRouter); // M2-B Nominatim
api.use('/providers', providerSearchRouter); // M2-B POST /providers/search
api.use(moneyRouter); // M2-A: /events/:id/expenses, /expenses/:id, /events/:id/contributions, /contributions/:id ...
api.use(collectionRouter); // M2-C: /tasks, /reservations/:id/tasks, /volunteers, /telegram/*, /notifications/:id/retry

export default api;
