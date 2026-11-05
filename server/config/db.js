import mongoose from 'mongoose';
import { env } from './env.js';

// On Vercel the same warm function instance handles many requests, so we keep
// one connection promise and reuse it instead of reconnecting every time.
let connectionPromise = null;

export function connectDB(uri = env.mongoUri) {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);
  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 8000 })
      .catch((err) => {
        connectionPromise = null; // allow a retry on the next request
        throw err;
      });
  }
  return connectionPromise;
}
