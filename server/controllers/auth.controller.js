import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Organization } from '../models/Organization.js';
import { ROLES_NEEDING_APPROVAL, COORDINATOR_ROLES } from '../config/constants.js';
import { signToken } from '../middleware/auth.js';
import { logAudit } from '../services/audit.service.js';
import { getEffectivePlan } from '../services/plan.service.js';
import { httpError } from '../utils/httpError.js';

// POST /api/auth/signup
export async function signup(req, res) {
  const data = req.body;
  const email = data.email.toLowerCase();

  if (await User.exists({ email })) throw httpError(409, 'An account with this email already exists');

  const user = await User.create({
    name: data.name,
    email,
    passwordHash: await bcrypt.hash(data.password, 10), // 10 = bcrypt cost (work factor)
    role: data.role,
    phone: data.phone,
    division: data.division,
    district: data.district,
    approvalStatus: ROLES_NEEDING_APPROVAL.includes(data.role) ? 'pending' : 'approved',
  });

  // Coordinators register their organization in the same step; an admin approves both together.
  if (COORDINATOR_ROLES.includes(data.role)) {
    const organization = await Organization.create({
      name: data.organizationName,
      type: data.role === 'orphanage_coordinator' ? 'orphanage' : 'outreach',
      division: data.division,
      district: data.district,
      address: data.organizationAddress || '',
      contactPhone: data.phone,
      defaultReceivingCapacity: data.receivingCapacity || 0,
      coordinators: [user._id],
    });
    user.organization = organization._id;
    await user.save();
  }

  await logAudit({ actor: user, action: 'user.signup', entityType: 'user', entityId: user._id });
  res.status(201).json({ token: signToken(user), user });
}

// POST /api/auth/login
export async function login(req, res) {
  const email = req.body.email.toLowerCase();
  const user = await User.findOne({ email }).select('+passwordHash');

  // Same message for "unknown email" and "wrong password", so nobody can probe which emails exist.
  const passwordOk = user && (await bcrypt.compare(req.body.password, user.passwordHash));
  if (!passwordOk) throw httpError(401, 'Wrong email or password');

  res.json({ token: signToken(user), user });
}

// POST /api/auth/logout
// The token lives in the browser, so the client deletes it. We only record the event.
export async function logout(req, res) {
  await logAudit({ actor: req.user, action: 'user.logout', entityType: 'user', entityId: req.user._id });
  res.json({ ok: true });
}

// GET /api/auth/me: who am I, and which plan am I on?
export async function me(req, res) {
  await req.user.populate('organization');
  const plan = await getEffectivePlan(req.user);
  res.json({ user: req.user, plan });
}
