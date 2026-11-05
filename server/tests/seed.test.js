import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startTestDB, stopTestDB } from './helpers.js';
import { runSeed } from '../seed/runSeed.js';
import { User } from '../models/User.js';

beforeAll(startTestDB);
afterAll(stopTestDB);

describe('seed safety', () => {
  it('seeds an empty database', async () => {
    const summary = await runSeed();
    expect(summary.plans).toBe(4);
    expect(await User.countDocuments({ role: 'admin' })).toBe(1);
  });

  it("refuses to wipe a database that holds another app's collections", async () => {
    await mongoose.connection.db.collection('someone_elses_orders').insertOne({ item: 'keep me' });
    await expect(runSeed()).rejects.toThrow(/Refusing to reset/);
    // their data is untouched
    expect(await mongoose.connection.db.collection('someone_elses_orders').countDocuments()).toBe(1);
  });
});
