import { ProviderProfile } from '../models/ProviderProfile.js';
import { Credential } from '../models/Credential.js';
import { File } from '../models/File.js';
import { User } from '../models/User.js';
import { CREDENTIAL_LABELS } from '../config/constants.js';
import { runExpiryCheck } from '../services/provider.service.js';
import { logAudit } from '../services/audit.service.js';
import { notifyUsers } from '../services/notify.service.js';
import { httpError } from '../utils/httpError.js';

// ---------- Provider side ----------

// POST /api/providers/me/credentials (multipart form with a "file" field)
// multer has already checked size and type and put the bytes in req.file.buffer.
export async function uploadCredential(req, res) {
  if (!req.file) throw httpError(400, 'Please choose a file to upload');
  const provider = await ProviderProfile.findOne({ user: req.user._id });
  if (!provider) throw httpError(404, 'Create your business profile first');

  const file = await File.create({
    owner: req.user._id,
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    data: req.file.buffer,
  });
  const credential = await Credential.create({ ...req.body, provider: provider._id, file: file._id });

  await logAudit({
    actor: req.user, action: 'credential.upload', entityType: 'credential', entityId: credential._id,
    changes: [{ field: 'type', from: null, to: credential.type }],
  });
  const admins = await User.find({ role: 'admin' }).distinct('_id');
  await notifyUsers(admins, {
    type: 'credential.submitted',
    title: 'New credential to review',
    body: `${provider.businessName} uploaded a ${CREDENTIAL_LABELS[credential.type].toLowerCase()}.`,
    link: '/admin/credentials',
  });

  res.status(201).json({ credential });
}

// GET /api/providers/me/credentials: newest first, with review status
export async function listMine(req, res) {
  const provider = await ProviderProfile.findOne({ user: req.user._id });
  if (!provider) return res.json({ credentials: [] });
  const credentials = await Credential.find({ provider: provider._id })
    .populate('file', 'filename mimeType size')
    .sort({ createdAt: -1 });
  res.json({ credentials });
}

// GET /api/files/:id: only the person who uploaded the file, or an admin, may open it.
export async function downloadFile(req, res) {
  const file = await File.findById(req.params.id).select('+data');
  const allowed = file && (String(file.owner) === String(req.user._id) || req.user.role === 'admin');
  if (!allowed) throw httpError(404, 'File not found'); // 404 (not 403) so the file's existence is not revealed

  res.set('Content-Type', file.mimeType);
  res.set('Content-Disposition', `inline; filename="${file.filename.replace(/"/g, '')}"`);
  res.send(file.data);
}

// ---------- Admin side ----------

// GET /api/admin/credentials?status=pending
export async function adminList(req, res) {
  await runExpiryCheck(); // lazy check: warn providers about expired documents whenever admins look
  const credentials = await Credential.find({ status: req.validQuery.status })
    .populate({
      path: 'provider',
      select: 'businessName category division district user',
      populate: { path: 'user', select: 'name email approvalStatus' },
    })
    .populate('file', 'filename mimeType size')
    .populate('reviewedBy', 'name')
    .sort({ createdAt: 1 });
  res.json({ credentials });
}

// PATCH /api/admin/credentials/:id   body: { status: 'approved' | 'rejected', note }
export async function adminReview(req, res) {
  const { status, note } = req.body;

  // Guarded update: only a PENDING credential can be decided, so two admins clicking
  // at the same moment cannot both review it (the second gets null -> 409).
  const credential = await Credential.findOneAndUpdate(
    { _id: req.params.id, status: 'pending' },
    { status, reviewNote: note, reviewedBy: req.user._id, reviewedAt: new Date() },
    { returnDocument: 'after' }
  ).populate('provider', 'businessName user');

  if (!credential) {
    const exists = await Credential.exists({ _id: req.params.id });
    throw httpError(exists ? 409 : 404, exists ? 'This credential has already been reviewed' : 'Credential not found');
  }

  await logAudit({
    actor: req.user, action: `credential.${status === 'approved' ? 'approve' : 'reject'}`,
    entityType: 'credential', entityId: credential._id,
    changes: [{ field: 'status', from: 'pending', to: status }], reason: note,
  });
  await notifyUsers([credential.provider.user], {
    type: 'credential.reviewed',
    title: `${CREDENTIAL_LABELS[credential.type]} ${status === 'approved' ? 'approved' : 'rejected'}`,
    body: note,
    link: '/provider/credentials',
  });

  res.json({ credential });
}

// POST /api/admin/credentials/expiry-check: run the expiry check now (it also runs lazily)
export async function adminExpiryCheck(req, res) {
  res.json(await runExpiryCheck());
}
