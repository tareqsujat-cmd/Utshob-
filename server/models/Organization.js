import mongoose from 'mongoose';
import { ORGANIZATION_TYPES, DIVISION_NAMES, APPROVAL_STATUSES } from '../config/constants.js';

// A community organization: an orphanage or a street-outreach group.
const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ORGANIZATION_TYPES, required: true },
    division: { type: String, enum: DIVISION_NAMES, required: true },
    district: { type: String, required: true },
    address: { type: String, default: '' },
    location: { lat: Number, lng: Number },
    contactPhone: { type: String, default: '' },
    defaultReceivingCapacity: { type: Number, default: 0, min: 0 },
    coordinators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    approvalStatus: { type: String, enum: APPROVAL_STATUSES, default: 'pending' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
  },
  { timestamps: true }
);

organizationSchema.index({ type: 1, division: 1 });

export const Organization = mongoose.model('Organization', organizationSchema);
