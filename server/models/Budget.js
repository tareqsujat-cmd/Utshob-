import mongoose from 'mongoose';
import { BUDGET_CATEGORIES } from '../config/constants.js';

const lineSchema = new mongoose.Schema(
  {
    category: { type: String, enum: BUDGET_CATEGORIES, required: true },
    estimated: { type: Number, required: true, min: 0 }, // BDT
    note: { type: String, default: '' },
  },
  { _id: false }
);

// One budget SCENARIO for an event (e.g. "Standard", "Lean"). Every saved change becomes a new
// VERSION; old versions stay in `versions` so the history of approved changes is never lost.
const budgetSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    name: { type: String, required: true, trim: true },
    isPrimary: { type: Boolean, default: false }, // the scenario used for alerts and reports
    version: { type: Number, default: 1 }, // number of the current version
    lines: [lineSchema], // the current version's lines
    versions: [
      {
        _id: false,
        version: Number,
        lines: [lineSchema],
        total: Number,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reason: String,
        source: { type: String, enum: ['initial', 'manual', 'copy', 'ai', 'quote_approval'] },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

budgetSchema.index({ event: 1, name: 1 }, { unique: true });

export const Budget = mongoose.model('Budget', budgetSchema);
