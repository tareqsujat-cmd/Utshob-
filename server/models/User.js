import mongoose from 'mongoose';
import { ROLES, DIVISION_NAMES, APPROVAL_STATUSES } from '../config/constants.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select: false = never returned by queries unless we ask with .select('+passwordHash')
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    phone: { type: String, trim: true, default: '' },
    division: { type: String, enum: DIVISION_NAMES },
    district: { type: String, trim: true },
    approvalStatus: { type: String, enum: APPROVAL_STATUSES, default: 'approved' },
    approvalNote: { type: String, default: '' },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    // Filled in by the Telegram feature (M2-C)
    telegram: {
      chatId: String,
      linkCode: String,
      linkCodeExpiresAt: Date,
      linkedAt: Date,
    },
    // Enterprise plan only (M3-D)
    branches: [{ name: String, division: String }],
  },
  { timestamps: true }
);

// Hide private fields whenever a user is sent as JSON.
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    if (ret.telegram) delete ret.telegram.linkCode;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
