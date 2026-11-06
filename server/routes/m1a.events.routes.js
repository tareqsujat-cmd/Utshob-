import { Router } from 'express';
import * as events from '../controllers/m1a.events.controller.js';
import * as budget from '../controllers/m1a.budget.controller.js';
import * as invitation from '../controllers/m1a.invitation.controller.js';
import * as food from '../controllers/m1a.foodplan.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { publicLimiter } from '../middleware/rateLimits.js';
import * as s from '../validators/m1a.events.schemas.js';

// M1-A Event management.
// Hosts (owner + co-organizers) change events; admins may only view.
// Which event a user may touch is checked inside the controllers (findEventForUser / findEditableEvent).
const hosts = [requireAuth, requireRole('host')];
const viewers = [requireAuth, requireRole('host', 'admin')];

// /api/events
export const eventsRouter = Router();
eventsRouter.get('/', viewers, validate(s.eventListQuerySchema, 'query'), events.listEvents);
eventsRouter.post('/', hosts, validate(s.createEventSchema), events.createEvent);
eventsRouter.get('/:id', viewers, events.getEvent);
eventsRouter.patch('/:id', hosts, validate(s.updateEventSchema), events.updateEvent);
eventsRouter.post('/:id/plan', hosts, events.markPlanned);
eventsRouter.post('/:id/complete', hosts, events.markCompleted);
eventsRouter.post('/:id/copy', hosts, validate(s.copySchema), events.copyEvent);
eventsRouter.post('/:id/cancel', hosts, validate(s.cancelSchema), events.cancelEvent);
eventsRouter.post('/:id/reschedule', hosts, validate(s.rescheduleSchema), events.rescheduleEvent);
eventsRouter.get('/:id/history', viewers, events.getHistory);
eventsRouter.put('/:id/organizers', hosts, validate(s.organizersSchema), events.setOrganizers);
// budget
eventsRouter.get('/:id/budgets', viewers, budget.listBudgets);
eventsRouter.post('/:id/budgets', hosts, validate(s.newScenarioSchema), budget.createBudgetScenario);
eventsRouter.get('/:id/budget-summary', viewers, budget.getBudgetSummary);
// invitation + RSVPs
eventsRouter.put('/:id/invitation', hosts, validate(s.invitationSchema), invitation.saveInvitation);
eventsRouter.get('/:id/rsvps', viewers, invitation.listRsvps);
// food plan
eventsRouter.put('/:id/menu', hosts, validate(s.menuSchema), food.saveMenu);
eventsRouter.get('/:id/food-plan', viewers, validate(s.foodPlanQuerySchema, 'query'), food.getFoodPlan);
eventsRouter.post('/:id/batches', hosts, validate(s.batchSchema), food.addBatch);
eventsRouter.post('/:id/food-plan/suggest', hosts, validate(s.suggestSchema), food.suggestFoodPlan);
eventsRouter.post('/:id/food-plan/apply', hosts, validate(s.applySchema), food.applyFoodPlan);

// /api/budgets
export const budgetsRouter = Router();
budgetsRouter.patch('/:budgetId', hosts, validate(s.budgetLinesSchema), budget.updateBudget);
budgetsRouter.patch('/:budgetId/primary', hosts, budget.makePrimary);

// /api/batches
export const batchesRouter = Router();
batchesRouter.patch('/:batchId/status', hosts, validate(s.batchStatusSchema), food.updateBatchStatus);

// /api/public: no login (guests answering an invitation). Rate-limited.
export const publicRouter = Router();
publicRouter.get('/invitations/:slug', publicLimiter, invitation.getPublicInvitation);
publicRouter.post('/invitations/:slug/rsvp', publicLimiter, validate(s.rsvpSchema), invitation.submitRsvp);
