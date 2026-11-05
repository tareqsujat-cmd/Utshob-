import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

// Limits are skipped in automated tests so tests can make many requests quickly.
const common = { standardHeaders: 'draft-8', legacyHeaders: false, skip: () => env.isTest };

// All API routes: plenty for normal use, stops runaway scripts.
export const apiLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 1000 });

// Login/signup: slows down password guessing.
export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

// Public pages without login (RSVP form, payment callbacks).
export const publicLimiter = rateLimit({ ...common, windowMs: 60 * 1000, limit: 30 });
