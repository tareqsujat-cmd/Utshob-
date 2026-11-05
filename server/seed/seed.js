// "npm run seed": connect, reset the demo data, disconnect.
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { runSeed } from './runSeed.js';
import { DEMO_PASSWORD } from './data/users.js';

await connectDB();
console.log('Seeding', env.mongoUri.replace(/\/\/.*@/, '//***@')); // hide the password in Atlas URLs
const summary = await runSeed();
console.log('Seed complete:', summary);
console.log(`Every demo account uses the password: ${DEMO_PASSWORD}`);
await mongoose.disconnect();
