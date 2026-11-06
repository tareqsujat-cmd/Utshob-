import { Router } from 'express';
import * as money from '../controllers/m2a.money.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as s from '../validators/m2a.money.schemas.js';

// M2-A Expenses and contributions. All URLs of this feature, written out in full.
// Organizer / owner checks happen in the controller (eventForMoney).
const hosts = [requireAuth, requireRole('host')];
const viewers = [requireAuth, requireRole('host', 'admin')];

export const moneyRouter = Router();

// expenses
moneyRouter.get('/events/:id/expenses', viewers, money.listExpenses);
moneyRouter.post('/events/:id/expenses', hosts, validate(s.expenseSchema), money.createExpense);
moneyRouter.patch('/expenses/:id', hosts, validate(s.expenseSchema), money.updateExpense);
moneyRouter.post('/expenses/:id/void', hosts, validate(s.reasonSchema), money.voidExpense);

// cost split between groups
moneyRouter.put('/events/:id/split', hosts, validate(s.splitSchema), money.setSplit);
moneyRouter.get('/events/:id/split-summary', viewers, money.getSplitSummary);

// contributions
moneyRouter.get('/events/:id/contributions', viewers, money.listContributions);
moneyRouter.post('/events/:id/contributions', hosts, validate(s.contributionSchema), money.createContribution);
moneyRouter.patch('/contributions/:id', hosts, validate(s.contributionSchema), money.updateContribution);
moneyRouter.post('/contributions/:id/receive', hosts, validate(s.receiveSchema), money.receiveContribution);
moneyRouter.post('/contributions/:id/checkout', hosts, validate(s.checkoutSchema), money.checkoutContribution);
moneyRouter.patch('/contributions/:id/fulfilment', hosts, validate(s.fulfilmentSchema), money.updateFulfilment);
moneyRouter.post('/contributions/:id/cancel', hosts, validate(s.reasonSchema), money.cancelContribution);
