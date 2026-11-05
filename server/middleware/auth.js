import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { httpError } from '../utils/httpError.js';

// Creates the login token. It only stores the user id; role and approval are
// always re-read from the database, so a role change takes effect immediately.
export function signToken(user) {
  return jwt.sign({ userId: user._id.toString() }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

// 1) Is there a valid token? Puts the logged-in user on req.user.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw httpError(401, 'Please log in first');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw httpError(401, 'Your session has expired. Please log in again.');
  }

  const user = await User.findById(payload.userId);
  if (!user) throw httpError(401, 'Account not found');
  req.user = user;
  next();
}

// 2) Does the user have one of the allowed roles? Usage: requireRole('host', 'admin')
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      throw httpError(403, 'Your role is not allowed to do this');
    }
    next();
  };
}

// 3) Has an admin approved this account? (providers and coordinators start "pending")
export function requireApproved(req, res, next) {
  if (req.user.approvalStatus !== 'approved') {
    throw httpError(403, 'Your account is waiting for administrator approval');
  }
  next();
}
