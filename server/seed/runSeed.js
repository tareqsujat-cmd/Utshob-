import mongoose from 'mongoose';
import '../models/index.js'; // registers every model
import { Plan } from '../models/Plan.js';
import { PLANS } from './data/plans.js';
import { seedUsers } from './data/users.js';

// Safety check before wiping: if this database contains collections our app did not create,
// it probably belongs to someone else (e.g. a teammate in a shared Atlas cluster). Stop.
async function assertDatabaseIsOurs() {
  const ourCollections = new Set(Object.values(mongoose.models).map((model) => model.collection.collectionName));
  const existing = await mongoose.connection.db.listCollections().toArray();
  const foreign = existing.map((c) => c.name).filter((name) => !ourCollections.has(name) && !name.startsWith('system.'));
  if (foreign.length > 0) {
    throw new Error(
      `Refusing to reset database "${mongoose.connection.db.databaseName}": it contains collections ` +
        `that do not belong to UTSHOB (${foreign.join(', ')}). Use your own database name in MONGODB_URI.`
    );
  }
}

// Wipes all collections and inserts the demo data.
// Used by "npm run seed" and by the admin "Reset demo" button.
export async function runSeed() {
  await assertDatabaseIsOurs();

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
