import { User } from '../models/User.js';
import { Organization } from '../models/Organization.js';
import { AuditLog } from '../models/AuditLog.js';
import { ROLES_NEEDING_APPROVAL } from '../config/constants.js';
import { env } from '../config/env.js';
import { logAudit } from '../services/audit.service.js';
import { notifyUsers } from '../services/notify.service.js';
import { EDITABLE_SETTINGS, getSetting, setSetting } from '../services/settings.service.js';
import { runSeed } from '../seed/runSeed.js';
import { httpError } from '../utils/httpError.js';

// GET /api/admin/approvals: accounts waiting for a decision (oldest first)
export async function listPendingApprovals(req, res) {
  const users = await User.find({ approvalStatus: 'pending' }).populate('organization').sort({ createdAt: 1 });
  res.json({ users });
}

// GET /api/admin/users?role=&status=
export async function listUsers(req, res) {
  const { role, status } = req.validQuery;
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.approvalStatus = status;
  const users = await User.find(filter).populate('organization', 'name type').sort({ createdAt: -1 }).limit(200);
  res.json({ users });
}

// PATCH /api/admin/users/:id/approval   body: { status: 'approved' | 'rejected', note }
// Approving a coordinator also approves the organization they registered.
export async function decideUserApproval(req, res) {
  const { status, note } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw httpError(404, 'User not found');
  if (!ROLES_NEEDING_APPROVAL.includes(user.role)) throw httpError(400, 'This role does not need approval');
  if (status === 'rejected' && !note) throw httpError(400, 'Please give a reason when rejecting');

  const previousStatus = user.approvalStatus;
  user.approvalStatus = status;
  user.approvalNote = note;
  await user.save();

  if (user.organization) {
    await Organization.updateOne(
      { _id: user.organization },
      { approvalStatus: status, approvedBy: req.user._id, approvedAt: new Date() }
    );
  }

  await logAudit({
    actor: req.user,
    action: status === 'approved' ? 'user.approve' : 'user.reject',
    entityType: 'user',
    entityId: user._id,
    changes: [{ field: 'approvalStatus', from: previousStatus, to: status }],
    reason: note,
  });
  await notifyUsers([user._id], {
    type: 'account.approval',
    title: status === 'approved' ? 'Your account has been approved' : 'Your account was not approved',
    body: note,
    link: '/',
  });

  res.json({ user });
}

// GET /api/admin/audit-logs?entityType=&action=&page=
export async function listAuditLogs(req, res) {
  const { entityType, action, page } = req.validQuery;
  const filter = {};
  if (entityType) filter.entityType = entityType;
  if (action) filter.action = action;

  const pageSize = 50;
  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ at: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate('actor', 'name email role'),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ logs, total, page, pageSize });
}

// GET /api/admin/settings
export async function listSettings(req, res) {
  const settings = [];
  for (const [key, info] of Object.entries(EDITABLE_SETTINGS)) {
    settings.push({ key, label: info.label, description: info.description, value: await getSetting(key) });
  }
  res.json({ settings });
}

// PATCH /api/admin/settings/:key   body: { value }
export async function updateSetting(req, res) {
  const { key } = req.params;
  if (!EDITABLE_SETTINGS[key]) throw httpError(404, 'Unknown setting');

  const previous = await getSetting(key);
  const setting = await setSetting(key, req.body.value);
  await logAudit({
    actor: req.user,
    action: 'setting.update',
    entityType: 'setting',
    entityId: setting._id,
    changes: [{ field: key, from: previous, to: req.body.value }],
  });
  res.json({ key, value: setting.value });
}

// POST /api/admin/demo/reset: wipe and re-insert the demo data (only when DEMO_MODE=true)
export async function resetDemo(req, res) {
  if (!env.demoMode) throw httpError(403, 'Demo reset is disabled (DEMO_MODE is not true)');
  const summary = await runSeed();
  res.json({ ok: true, summary });
}
