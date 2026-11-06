import { Payment } from '../models/Payment.js';
import { env } from '../config/env.js';
import { validate, queryByTranId } from '../services/sslcommerz.service.js';
import { confirmPayment, closePayment } from '../services/payment.service.js';
import { httpError } from '../utils/httpError.js';

// After paying, the GATEWAY sends the user's browser back to us with a form POST.
// We check the payment with the gateway's validation API (never trusting the posted status),
// then send the browser on to the React result page.
const resultPage = (tranId) => `${env.clientOrigin}/payments/${encodeURIComponent(tranId || 'unknown')}`;

// POST /api/payments/sslcommerz/success
export async function gatewaySuccess(req, res) {
  const { tran_id: tranId, val_id: valId } = req.body;
  try {
    if (tranId && valId) await confirmPayment(tranId, await validate(valId));
  } catch (err) {
    console.error('Payment confirmation failed:', err.message); // the result page offers "Check status" to retry
  }
  res.redirect(303, resultPage(tranId));
}

// POST /api/payments/sslcommerz/fail
export async function gatewayFail(req, res) {
  await closePayment(req.body.tran_id, 'failed', req.body.error || 'The payment failed at the gateway');
  res.redirect(303, resultPage(req.body.tran_id));
}

// POST /api/payments/sslcommerz/cancel
export async function gatewayCancel(req, res) {
  await closePayment(req.body.tran_id, 'cancelled', 'Cancelled on the payment page');
  res.redirect(303, resultPage(req.body.tran_id));
}

// POST /api/payments/sslcommerz/ipn: server-to-server notification (works only on the public URL).
// Same confirmation as above; thanks to idempotency it doesn't matter which arrives first.
export async function gatewayIpn(req, res) {
  const { tran_id: tranId, val_id: valId, status } = req.body;
  if (tranId && valId && status === 'VALID') {
    try {
      await confirmPayment(tranId, await validate(valId));
    } catch (err) {
      console.error('IPN confirmation failed:', err.message);
    }
  }
  res.send('OK');
}

// Only the person who started a payment (or an admin) may see it.
async function myPayment(tranId, user) {
  const payment = await Payment.findOne({ tranId });
  if (!payment || (String(payment.user) !== String(user._id) && user.role !== 'admin')) {
    throw httpError(404, 'Payment not found');
  }
  return payment;
}

// GET /api/payments/:tranId
export async function getPayment(req, res) {
  res.json({ payment: await myPayment(req.params.tranId, req.user) });
}

// POST /api/payments/:tranId/verify: "Check status": asks the gateway directly by transaction id.
// Fallback when the browser never returned to the success URL (closed tab, lost connection).
export async function verifyPayment(req, res) {
  const payment = await myPayment(req.params.tranId, req.user);
  if (payment.status === 'initiated') {
    const found = await queryByTranId(payment.tranId);
    if (found) await confirmPayment(payment.tranId, found);
  }
  res.json({ payment: await Payment.findById(payment._id) });
}
