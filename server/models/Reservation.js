import mongoose from 'mongoose';
import { FOOD_UNITS, RESERVATION_STATUSES } from '../config/constants.js';

// Part of a surplus listing held for one organization's request.
// Quantity balance (checked by M3-F): quantityReserved = collected + shortage + released + still waiting
const reservationSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'SurplusListing', required: true },
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRequest', required: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    coordinator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    unit: { type: String, enum: FOOD_UNITS, required: true },
    quantityReserved: { type: Number, required: true, min: 0 },
    quantityReleased: { type: Number, default: 0, min: 0 }, // given back to the listing (cancel / missed)
    quantityCollected: { type: Number, default: 0, min: 0 }, // set by collection (M2-C)
    quantityShortage: { type: Number, default: 0, min: 0 }, // not there at pickup (M2-C / M3-F)
    status: { type: String, enum: RESERVATION_STATUSES, default: 'reserved' },
    // Sent by the browser per form submit; the unique index turns a double-click into ONE reservation.
    idempotencyKey: { type: String },
    history: [{ _id: false, action: String, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now }, note: String }],
  },
  { timestamps: true }
);

reservationSchema.index({ listing: 1 });
reservationSchema.index({ organization: 1, status: 1 });
reservationSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export const Reservation = mongoose.model('Reservation', reservationSchema);
