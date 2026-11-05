import { AppSetting } from '../models/AppSetting.js';

// Keys an admin may change from the UI. Anything else is rejected.
export const EDITABLE_SETTINGS = {
  telegramFaultInjection: {
    label: 'Simulate Telegram outage',
    description: 'Every Telegram send fails on purpose, to demonstrate logging, retry and the dashboard fallback.',
    default: false,
  },
};

export async function getSetting(key) {
  const setting = await AppSetting.findOne({ key }).lean();
  return setting ? setting.value : EDITABLE_SETTINGS[key]?.default;
}

export function setSetting(key, value) {
  return AppSetting.findOneAndUpdate({ key }, { value }, { upsert: true, returnDocument: 'after' });
}
