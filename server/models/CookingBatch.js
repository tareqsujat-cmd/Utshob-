import mongoose from 'mongoose';
import { FOOD_UNITS, BATCH_STATUSES } from '../config/constants.js';

// One batch of a dish to cook, e.g. "35 kg kacchi biryani".
// planned -> started -> completed (or planned -> cancelled). Started and completed batches are
// never changed by plan adjustments: only planned ones can grow, shrink or be cancelled.
const cookingBatchSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    menuItemId: { type: mongoose.Schema.Types.ObjectId, required: true }, // _id of the item in event.menu
    menuItemName: { type: String, required: true }, // kept even if the dish is later removed from the menu
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, enum: FOOD_UNITS, required: true }, // always the menu item's unit
    status: { type: String, enum: BATCH_STATUSES, default: 'planned' },
    startedAt: Date,
    completedAt: Date,
    note: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

cookingBatchSchema.index({ event: 1, status: 1 });

export const CookingBatch = mongoose.model('CookingBatch', cookingBatchSchema);
