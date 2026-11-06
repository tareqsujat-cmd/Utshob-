import crypto from 'node:crypto';
import { Payment } from '../models/Payment.js';
import { initSession } from './sslcommerz.service.js';
import { applyContributionPayment } from './contribution.service.js';
import { logAudit } from './audit.service.js';

// "UTS-1793948205-3f9a1c": unique, and readable in the gateway's dashboard.
const newTranId = () => `UTS-${Math.floor(Date.now() / 1000)}-${crypto.randomBytes(3).toString('hex')}`;

// Start a sandbox payment for any purpose. Returns { payment, gatewayUrl }.
// If the gateway can't be reached, the payment is marked failed and the error goes to the UI.
export async function startPayment({ purpose, refId, user, amount, description, returnTo }) {
  const payment = await Payment.create({
    tranId: newTranId(), purpose, refId, user: user._id, amount, description, returnTo,
  });
  try {
    const gatewayUrl = await initSession({
      tranId: payment.tranId,
      amount,
      productName: description,
      customer: { name: user.name, email: user.email, phone: user.phone, city: user.district },
    });
    return { payment, gatewayUrl };
  } catch (err) {
    await Payment.updateOne({ _id: payment._id }, { status: 'failed', error: err.message });
    throw err;
  }
}

// Apply what a paid payment is FOR. Each purpose's function is itself guarded,
// so even if it were called twice, the money would be counted once.
async function applyEffect(payment) {
  if (payment.purpose === 'contribution') return applyContributionPayment(payment); // M2-A
  // 'booking_deposit' is added by M3-C, 'subscription' by M3-D.
  throw new Error(`No handler for payment purpose ${payment.purpose}`);
}

// Turn a gateway validation answer into a confirmed payment, exactly once.
// Safe to call many times (success callback + IPN + "check status" button): IDEMPOTENT.
export async function confirmPayment(tranId, validation) {
  const payment = await Payment.findOne({ tranId });
  if (!payment) return { payment: null, outcome: 'unknown' };

  // 1) Is the gateway's answer genuine and for exactly this payment?
  const valid = validation && ['VALID', 'VALIDATED'].includes(validation.status);
  const matches = valid
    && validation.tran_id === tranId
    && Math.abs(Number(validation.amount) - payment.amount) < 0.01
    && validation.currency === 'BDT';
  if (!matches) {
    const reason = valid ? 'Amount, currency or transaction id did not match' : `Gateway status: ${validation?.status || 'none'}`;
    await Payment.updateOne({ _id: payment._id, status: 'initiated' }, { status: 'failed', error: reason });
    return { payment: await Payment.findById(payment._id), outcome: 'failed' };
  }

  // 2) initiated -> paid. Only the FIRST caller matches the filter; later callers get null.
  await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'initiated' },
    {
      status: 'paid',
      valId: validation.val_id,
      gatewayStatus: validation.status,
      cardType: validation.card_type,
      bankTranId: validation.bank_tran_id,
      verifiedAt: new Date(),
    }
  );

  // 3) Claim the side effect: set appliedAt only if it is still empty. One caller wins.
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'paid', appliedAt: null },
    { appliedAt: new Date() },
    { returnDocument: 'after' }
  );
  if (claimed) {
    try {
      await applyEffect(claimed);
      await logAudit({ actor: { _id: claimed.user }, action: 'payment.confirm', entityType: 'payment', entityId: claimed._id, changes: [{ field: 'status', from: 'initiated', to: 'paid' }] });
    } catch (err) {
      await Payment.updateOne({ _id: claimed._id }, { appliedAt: null }); // let a later call retry
      throw err;
    }
  }
  return { payment: await Payment.findById(payment._id), outcome: 'paid' };
}

// The user cancelled on the gateway page, or the gateway reported a failure.
export function closePayment(tranId, status, reason) {
  return Payment.updateOne({ tranId, status: 'initiated' }, { status, error: reason });
}
