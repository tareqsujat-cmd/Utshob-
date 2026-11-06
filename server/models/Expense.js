import mongoose from 'mongoose';
import { BUDGET_CATEGORIES } from '../config/constants.js';

// Money actually spent for an event. Never deleted: a mistake is VOIDED with a reason.
const expenseSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    category: { type: String, enum: BUDGET_CATEGORIES, required: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 1 }, // BDT
    date: { type: Date, required: true },
    paidByName: { type: String, default: '' }, // the person who paid
    paidByGroup: { type: String, default: '' }, // the cost group that paid it (counts toward its share)
    status: { type: String, enum: ['recorded', 'void'], default: 'recorded' },
    voidReason: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

expenseSchema.index({ event: 1, status: 1 });

export const Expense = mongoose.model('Expense', expenseSchema);
