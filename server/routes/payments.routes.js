import { Router } from 'express';
import * as payments from '../controllers/payments.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { publicLimiter } from '../middleware/rateLimits.js';

// Shared sandbox checkout (SSLCOMMERZ). Used by contributions (M2-A), deposits (M3-C), subscriptions (M3-D).
export const paymentsRouter = Router();

// Called by the gateway (browser form POST or server IPN), so no login. Nothing here is trusted:
// every confirmation is checked with the gateway's validation API.
paymentsRouter.post('/sslcommerz/success', publicLimiter, payments.gatewaySuccess);
paymentsRouter.post('/sslcommerz/fail', publicLimiter, payments.gatewayFail);
paymentsRouter.post('/sslcommerz/cancel', publicLimiter, payments.gatewayCancel);
paymentsRouter.post('/sslcommerz/ipn', publicLimiter, payments.gatewayIpn);

// For the logged-in payer.
paymentsRouter.get('/:tranId', requireAuth, payments.getPayment);
paymentsRouter.post('/:tranId/verify', requireAuth, payments.verifyPayment);
