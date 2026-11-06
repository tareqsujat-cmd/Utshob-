import { Router } from 'express';
import * as surplus from '../controllers/m1c.surplus.controller.js';
import * as requests from '../controllers/m1c.requests.controller.js';
import { requireAuth, requireRole, requireApproved } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as s from '../validators/m1c.surplus.schemas.js';

// M1-C Surplus food.
// Posters: hosts (for their own events) and approved providers. Coordinators: approved orphanage
// and outreach coordinators. Record-level checks (own listing, own organization) are in the controllers.
const posters = [requireAuth, requireRole('host', 'provider'), requireApproved];
const coordinators = [requireAuth, requireRole('orphanage_coordinator', 'outreach_coordinator'), requireApproved];
const anyoneInvolved = [requireAuth, requireApproved];

// /api/surplus
export const surplusRouter = Router();
surplusRouter.post('/', posters, validate(s.listingSchema), surplus.createListing);
surplusRouter.get('/', [requireAuth, requireRole('orphanage_coordinator', 'outreach_coordinator', 'admin'), requireApproved], validate(s.surplusQuerySchema, 'query'), surplus.listOpenListings);
surplusRouter.get('/mine', posters, surplus.listMyListings);
surplusRouter.get('/:id', anyoneInvolved, surplus.getListing);
surplusRouter.patch('/:id', posters, validate(s.listingUpdateSchema), surplus.updateListing);
surplusRouter.post('/:id/cancel', posters, validate(s.reasonSchema), surplus.cancelListing);

// /api/food-requests
export const foodRequestsRouter = Router();
foodRequestsRouter.post('/', coordinators, validate(s.foodRequestSchema), requests.createRequest);
foodRequestsRouter.get('/mine', coordinators, requests.listMyRequests);
foodRequestsRouter.patch('/:id', coordinators, validate(s.foodRequestSchema), requests.updateRequest);
foodRequestsRouter.post('/:id/cancel', coordinators, validate(s.reasonSchema), requests.cancelRequest);
foodRequestsRouter.get('/:id/matches', coordinators, requests.getMatches);

// /api/reservations
export const reservationsRouter = Router();
reservationsRouter.post('/', coordinators, validate(s.reservationSchema), requests.createReservation);
reservationsRouter.get('/', anyoneInvolved, requests.listReservations);
reservationsRouter.post('/:id/cancel', coordinators, validate(s.reasonSchema), requests.cancelReservation);
