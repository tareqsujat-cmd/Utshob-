import mongoose from 'mongoose';
import { CREDENTIAL_TYPES } from '../config/constants.js';

// A business document a provider submits (trade licence, food safety certificate ...).
// An admin approves or rejects it. Old documents are kept as history; a newer upload of the
// same type simply becomes the one that counts.
const credentialSchema = new mongoose.Schema(
  {
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderProfile', required: true },
    type: { type: String, enum: CREDENTIAL_TYPES, required: true },
    number: { type: String, required: true, trim: true }, // licence / certificate number
    issuedAt: Date,
    expiresAt: { type: Date, required: true },
    file: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewNote: { type: String, default: '' },
    // Set by the expiry check so the provider is only warned once per document.
    expiryNotifiedAt: Date,
  },
  { timestamps: true }
);

credentialSchema.index({ provider: 1, type: 1 });
credentialSchema.index({ status: 1, createdAt: 1 });

export const Credential = mongoose.model('Credential', credentialSchema);
