import mongoose from 'mongoose';

// Small key/value settings an admin can change at runtime (e.g. demo fault toggles).
const appSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

export const AppSetting = mongoose.model('AppSetting', appSettingSchema);
