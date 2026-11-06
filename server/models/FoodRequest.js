import mongoose from 'mongoose';
import { FOOD_UNITS, DIVISION_NAMES, ALLERGENS, REQUEST_STATUSES } from '../config/constants.js';

// What an orphanage or outreach team needs, and how much it can receive and carry.
const foodRequestSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    coordinator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orgType: { type: String, enum: ['orphanage', 'outreach'], required: true },
    title: { type: String, required: true, trim: true }, // e.g. "Dinner for 80 children"
    notes: { type: String, default: '' },
    unit: { type: String, enum: FOOD_UNITS, default: 'portion' },
    quantityNeeded: { type: Number, required: true, min: 1 },
    quantityMatched: { type: Number, default: 0, min: 0 }, // sum of active reservations
    receivingCapacity: { type: Number, required: true, min: 1 }, // most it can accept at once
    collectionCapacity: { type: Number, required: true, min: 1 }, // most its collectors can carry in one trip
    availability: [{ _id: false, from: Date, to: Date }], // when it can collect
    avoidAllergens: [{ type: String, enum: ALLERGENS }],
    division: { type: String, enum: DIVISION_NAMES, required: true },
    district: { type: String, required: true },
    location: { lat: Number, lng: Number },
    status: { type: String, enum: REQUEST_STATUSES, default: 'open' },
  },
  { timestamps: true }
);

foodRequestSchema.index({ organization: 1, status: 1 });

export const FoodRequest = mongoose.model('FoodRequest', foodRequestSchema);
