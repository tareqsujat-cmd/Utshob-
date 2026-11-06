import mongoose from 'mongoose';

// One sandbox payment through SSLCOMMERZ. Shared by contributions (M2-A), booking deposits (M3-C)
// and subscriptions (M3-D). We never trust what the browser says: a payment becomes "paid" only after
// OUR server asked SSLCOMMERZ's validation API (see payment.service.js).
const paymentSchema = new mongoose.Schema(
  {
    tranId: { type: String, required: true, unique: true }, // our transaction id (sent to the gateway)
    purpose: { type: String, enum: ['contribution', 'booking_deposit', 'subscription'], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true }, // the contribution / booking / subscription
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // who started it
    description: { type: String, default: '' },
    amount: { type: Number, required: true, min: 1 }, // BDT
    currency: { type: String, default: 'BDT' },
    status: { type: String, enum: ['initiated', 'paid', 'failed', 'cancelled'], default: 'initiated' },
    returnTo: { type: String, default: '/' }, // client page to show after paying
    // Filled from the gateway's validation answer:
    valId: String,
    gatewayStatus: String,
    cardType: String,
    bankTranId: String,
    verifiedAt: Date,
    // Set once the side effect (e.g. "contribution received") has been applied, so it happens only once.
    appliedAt: { type: Date, default: null },
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

paymentSchema.index({ purpose: 1, refId: 1 });

export const Payment = mongoose.model('Payment', paymentSchema);
