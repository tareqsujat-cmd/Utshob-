// Shared helpers for tests: an in-memory MongoDB, fresh data per test, quick user creation.
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import '../models/index.js';
import { User } from '../models/User.js';
import { Plan } from '../models/Plan.js';
import { PLANS } from '../seed/data/plans.js';
import { signToken } from '../middleware/auth.js';

let mongo;
let emailCounter = 0;

export async function startTestDB() {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}

export async function stopTestDB() {
  await mongoose.disconnect();
  await mongo.stop();
}

// Empty every collection and re-insert the plans (most features need them).
export async function resetTestDB() {
  for (const model of Object.values(mongoose.models)) {
    await model.init();
    await model.deleteMany({});
  }
  await Plan.insertMany(PLANS);
}

// Create a user directly in the DB and return it with a ready-to-use auth header.
export async function makeUser(overrides = {}) {
  emailCounter += 1;
  const user = await User.create({
    name: `Test User ${emailCounter}`,
    email: `user${emailCounter}@test.dev`,
    passwordHash: await bcrypt.hash('Password1', 4), // low cost = fast tests
    role: 'host',
    division: 'Dhaka',
    district: 'Dhaka',
    ...overrides,
  });
  const token = signToken(user);
  return { user, token, auth: { Authorization: `Bearer ${token}` } };
}

// api().get('/api/...') sends a request to the Express app without starting a server.
export const api = () => request(app);
