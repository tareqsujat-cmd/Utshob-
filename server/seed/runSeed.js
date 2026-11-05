import mongoose from 'mongoose';
import '../models/index.js'; // registers every model
import { Plan } from '../models/Plan.js';
import { PLANS } from './data/plans.js';
import { seedUsers } from './data/users.js';

// Wipes all collections and inserts the demo data.
// Used by "npm run seed" and by the admin "Reset demo" button.
export async function runSeed() {
  // 1) Empty every collection. deleteMany keeps the indexes; init() makes sure they exist.
  for (const model of Object.values(mongoose.models)) {
    await model.init();
    await model.deleteMany({});
  }

  // 2) Insert in dependency order (users before the records that point to them).
  const plans = await Plan.insertMany(PLANS);
  const users = await seedUsers();

  return { plans: plans.length, users: Object.keys(users).length };
}
