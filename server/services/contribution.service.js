import { Contribution } from '../models/Contribution.js';
import { httpError } from '../utils/httpError.js';

// pledged -> partially_received -> received, from the numbers. Cancelled stays cancelled.
export function statusFor(contribution) {
  if (contribution.status === 'cancelled') return 'cancelled';
  const { amountPledged, amountReceived, type, inKind } = contribution;
  if (type === 'in_kind') {
    if (inKind.receivedQuantity <= 0) return 'pledged';
    return inKind.receivedQuantity >= inKind.quantity ? 'received' : 'partially_received';
  }
  if (amountReceived <= 0) return 'pledged';
  return amountReceived >= amountPledged ? 'received' : 'partially_received';
}

async function refreshStatus(id) {
  const c = await Contribution.findById(id);
  const status = statusFor(c);
  if (status !== c.status) await Contribution.updateOne({ _id: id }, { status });
  return Contribution.findById(id);
}

// Record money RECEIVED for a cash/sponsorship contribution (kept apart from the PLEDGE).
// Guarded: never more than was pledged, and never for a cancelled contribution.
export async function receiveCash(contributionId, { amount, method, payment, user, note }) {
  const updated = await Contribution.findOneAndUpdate(
    {
      _id: contributionId,
      status: { $ne: 'cancelled' },
      type: { $in: ['cash', 'sponsorship'] },
      $expr: { $lte: [{ $add: ['$amountReceived', amount] }, '$amountPledged'] },
      ...(payment ? { appliedPayments: { $ne: payment } } : {}), // a payment can be applied only once
    },
    {
      $inc: { amountReceived: amount },
      $push: { receipts: { amount, method, payment, recordedBy: user, note, at: new Date() } },
      ...(payment ? { $addToSet: { appliedPayments: payment } } : {}),
    },
    { returnDocument: 'after' }
  );
  if (!updated) return null;
  return refreshStatus(updated._id);
}

// Called by payment.service when a sandbox payment for a contribution is confirmed.
export async function applyContributionPayment(payment) {
  const result = await receiveCash(payment.refId, {
    amount: payment.amount,
    method: 'sandbox',
    payment: payment._id,
    user: payment.user,
    note: `Online payment ${payment.tranId}`,
  });
  // null here means it was already applied (or would exceed the pledge): nothing is counted twice.
  if (!result) {
    const c = await Contribution.findById(payment.refId);
    if (!c?.appliedPayments.some((id) => String(id) === String(payment._id))) {
      throw httpError(409, 'Payment could not be applied: it would exceed the pledged amount');
    }
  }
  return result;
}
