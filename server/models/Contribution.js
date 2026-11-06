import mongoose from 'mongoose';
import { FOOD_UNITS } from '../config/constants.js';

// Help offered for an event: cash, goods ("in kind") or a sponsorship.
// PLEDGED (promised) and RECEIVED (actually given) are always separate fields.
const contributionSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    contributorName: { type: String, required: true, trim: true },
    contributorPhone: { type: String, default: '' },
    group: { type: String, default: '' }, // cost group it counts for (e.g. "Bride's family")
    type: { type: String, enum: ['cash', 'in_kind', 'sponsorship'], required: true },

    amountPledged: { type: Number, default: 0, min: 0 }, // BDT promised (cash / sponsorship money)
    amountReceived: { type: Number, default: 0, min: 0 }, // BDT actually received

    inKind: {
      description: String, // e.g. "Basmati rice"
      quantity: { type: Number, default: 0, min: 0 }, // pledged quantity
      unit: { type: String, enum: [...FOOD_UNITS, 'item'] },
      estimatedValue: { type: Number, default: 0, min: 0 }, // BDT, an estimate
      receivedQuantity: { type: Number, default: 0, min: 0 },
    },

    sponsorship: {
      sponsorName: String, // company or person
      offer: String, // what they give
      benefitsPromised: String, // what they get, e.g. "Logo on the stage banner"
      fulfilmentStatus: { type: String, enum: ['not_started', 'in_progress', 'fulfilled'], default: 'not_started' }, // Pro+
      fulfilmentNotes: String,
    },

    status: { type: String, enum: ['pledged', 'partially_received', 'received', 'cancelled'], default: 'pledged' },
    cancelReason: { type: String, default: '' },
    // Every receipt: manual cash/goods or an online (sandbox) payment.
    receipts: [
      {
        _id: false,
        amount: Number,
        quantity: Number,
        method: { type: String, enum: ['manual_cash', 'sandbox', 'in_kind'] },
        payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
        note: String,
        recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: Date,
      },
    ],
    appliedPayments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }], // guard: each payment counted once
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

contributionSchema.index({ event: 1, status: 1 });

export const Contribution = mongoose.model('Contribution', contributionSchema);
