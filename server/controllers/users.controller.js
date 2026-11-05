import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Organization } from '../models/Organization.js';
import { logAudit, diffFields } from '../services/audit.service.js';
import { httpError } from '../utils/httpError.js';

// PATCH /api/users/me
export async function updateMe(req, res) {
  const before = req.user.toObject();
  Object.assign(req.user, req.body); // already validated: name, phone, division, district
  await req.user.save();

  const changes = diffFields(before, req.user, ['name', 'phone', 'division', 'district']);
  if (changes.length) {
    await logAudit({ actor: req.user, action: 'user.update_profile', entityType: 'user', entityId: req.user._id, changes });
  }
  res.json({ user: req.user });
}

// PATCH /api/users/me/password
export async function changePassword(req, res) {
  const user = await User.findById(req.user._id).select('+passwordHash');
  const ok = await bcrypt.compare(req.body.currentPassword, user.passwordHash);
  if (!ok) throw httpError(400, 'Current password is wrong');

  user.passwordHash = await bcrypt.hash(req.body.newPassword, 10);
  await user.save();
  await logAudit({ actor: req.user, action: 'user.change_password', entityType: 'user', entityId: user._id });
  res.json({ ok: true });
}

// GET /api/organizations/mine
export async function getMyOrganization(req, res) {
  if (!req.user.organization) throw httpError(404, 'You are not linked to an organization');
  const organization = await Organization.findById(req.user.organization).populate('coordinators', 'name email phone');
  res.json({ organization });
}

// PATCH /api/organizations/mine
export async function updateMyOrganization(req, res) {
  if (!req.user.organization) throw httpError(404, 'You are not linked to an organization');
  const organization = await Organization.findById(req.user.organization);
  const before = organization.toObject();
  Object.assign(organization, req.body);
  await organization.save();

  const changes = diffFields(before, organization, ['address', 'contactPhone', 'defaultReceivingCapacity']);
  await logAudit({ actor: req.user, action: 'organization.update', entityType: 'organization', entityId: organization._id, changes });
  res.json({ organization });
}
