import mongoose from 'mongoose';

// Append-only history of important changes: who did what, to which record, when and why.
const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorRole: String,
  action: { type: String, required: true }, // e.g. 'event.update', 'user.approve'
  entityType: { type: String, required: true }, // e.g. 'event'
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  changes: [{ _id: false, field: String, from: mongoose.Schema.Types.Mixed, to: mongoose.Schema.Types.Mixed }],
  reason: { type: String, default: '' },
  at: { type: Date, default: Date.now },
});

auditLogSchema.index({ entityType: 1, entityId: 1, at: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
