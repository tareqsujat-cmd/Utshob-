import mongoose from 'mongoose';

// One in-app notification. Telegram delivery (M2-C) is tracked on the same document,
// so the dashboard always has the message even if Telegram fails.
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true }, // e.g. 'event.cancelled'
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: '' }, // client route to open, e.g. '/events/123'
    readAt: { type: Date, default: null },
    relatedTask: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionTask' },
    telegram: {
      status: { type: String, enum: ['skipped', 'pending', 'sent', 'failed'], default: 'skipped' },
      attempts: { type: Number, default: 0 },
      lastError: String,
      lastAttemptAt: Date,
      sentAt: Date,
    },
    // Optional unique key so the same notification (e.g. a reminder) is never created twice.
    dedupeKey: { type: String },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

export const Notification = mongoose.model('Notification', notificationSchema);
