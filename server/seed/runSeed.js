import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import '../models/index.js'; // registers every model
import { Plan } from '../models/Plan.js';
import { PLANS } from './data/plans.js';
import { seedUsers, DEMO_PASSWORD } from './data/users.js';
import { seedProviders } from './data/providers.js';
import { seedEvents } from './data/events.js';

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
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10); // hashed once, shared by all demo accounts
  const plans = await Plan.insertMany(PLANS);
  const users = await seedUsers(passwordHash);
  const providers = await seedProviders(passwordHash, users.admin); // M1-B
  const events = await seedEvents(users, providers); // M1-A

  return {
    plans: plans.length,
    users: Object.keys(users).length,
    providers: await mongoose.model('ProviderProfile').countDocuments(),
    events: Object.keys(events).filter((k) => !k.endsWith('Budget')).length,
    rsvps: await mongoose.model('Rsvp').countDocuments(),
  };
}
