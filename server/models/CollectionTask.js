import mongoose from 'mongoose';

// Who collects a reservation, when, and what happened.
// assigned / en_route / delayed are ACTIVE; collected, partially_collected, cancelled, missed are FINAL.
const collectionTaskSchema = new mongoose.Schema(
  {
    reservation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', required: true },
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'SurplusListing', required: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    collector: {
      type: { type: String, enum: ['volunteer', 'org_arranged'], required: true },
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // when a volunteer account collects
      name: { type: String, required: true },
      phone: { type: String, default: '' },
    },
    scheduledAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['assigned', 'en_route', 'delayed', 'collected', 'partially_collected', 'cancelled', 'missed'],
      default: 'assigned',
    },
    quantityCollected: { type: Number, default: 0, min: 0 },
    delay: { minutes: Number, reason: String },
    cancelReason: { type: String, default: '' },
    reminderSentAt: { type: Date, default: null },
    history: [{ _id: false, status: String, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now }, note: String }],
    // Set to the reservation id while the task is active. Unique => only ONE active task per reservation,
    // even if "Assign" is clicked twice or retried. Removed ($unset) when the task ends.
    activeKey: { type: String },
    idempotencyKey: { type: String },
  },
  { timestamps: true }
);

collectionTaskSchema.index({ activeKey: 1 }, { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } } });
collectionTaskSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
collectionTaskSchema.index({ 'collector.user': 1, status: 1 });
collectionTaskSchema.index({ organization: 1, scheduledAt: 1 });

export const CollectionTask = mongoose.model('CollectionTask', collectionTaskSchema);
