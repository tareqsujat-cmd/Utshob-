import { ProviderProfile } from '../models/ProviderProfile.js';
import { Credential } from '../models/Credential.js';
import { User } from '../models/User.js';
import { CREDENTIAL_LABELS } from '../config/constants.js';
import { evaluateBookability, bookabilityForMany, isCredentialValid } from '../services/provider.service.js';
import { logAudit, diffFields } from '../services/audit.service.js';
import { httpError } from '../utils/httpError.js';

const PROFILE_FIELDS = [
  'businessName', 'category', 'description', 'phone', 'address', 'division', 'district', 'location',
  'serviceAreas', 'capacity', 'allowsOutsideCatering', 'setupBufferHours', 'cleanupBufferHours', 'tags',
];

// The logged-in provider's own profile, or a 404 telling them to create it first.
async function myProfileOrFail(user) {
  const provider = await ProviderProfile.findOne({ user: user._id });
  if (!provider) throw httpError(404, 'Create your business profile first');
  return provider;
}

// ---------- Own profile (role: provider) ----------

// GET /api/providers/me
export async function getMine(req, res) {
  const provider = await ProviderProfile.findOne({ user: req.user._id });
  if (!provider) return res.json({ provider: null, bookability: null });

  const credentials = await Credential.find({ provider: provider._id });
  res.json({ provider, bookability: evaluateBookability(provider, req.user, credentials) });
}

// PUT /api/providers/me: create the profile the first time, update it afterwards.
export async function saveMine(req, res) {
  // The form sends service areas as ['Dhaka', 'Sylhet']; the model stores [{ division: 'Dhaka' }, ...]
  const data = { ...req.body, serviceAreas: req.body.serviceAreas.map((division) => ({ division })) };
  let provider = await ProviderProfile.findOne({ user: req.user._id });

  if (!provider) {
    provider = await ProviderProfile.create({ ...data, user: req.user._id });
    await logAudit({ actor: req.user, action: 'provider.create', entityType: 'provider', entityId: provider._id });
    return res.status(201).json({ provider });
  }

  const before = provider.toObject();
  provider.set(data);
  await provider.save();
  const changes = diffFields(before, provider.toObject(), PROFILE_FIELDS);
  if (changes.length) {
    await logAudit({ actor: req.user, action: 'provider.update', entityType: 'provider', entityId: provider._id, changes });
  }
  res.json({ provider });
}

// POST /api/providers/me/packages
export async function addPackage(req, res) {
  const provider = await myProfileOrFail(req.user);
  provider.packages.push(req.body);
  await provider.save();
  const created = provider.packages[provider.packages.length - 1];
  await logAudit({
    actor: req.user, action: 'provider.package_add', entityType: 'provider', entityId: provider._id,
    changes: [{ field: 'package', from: null, to: `${created.name} (৳${created.price})` }],
  });
  res.status(201).json({ package: created });
}

// PATCH /api/providers/me/packages/:packageId: edit, or archive with isArchived: true (never deleted)
export async function updatePackage(req, res) {
  const provider = await myProfileOrFail(req.user);
  const pkg = provider.packages.id(req.params.packageId); // find a sub-document by its _id
  if (!pkg) throw httpError(404, 'Package not found');

  const before = pkg.toObject();
  pkg.set(req.body);
  await provider.save();
  const changes = diffFields(before, pkg.toObject(), ['name', 'price', 'pricingType', 'minGuests', 'maxGuests', 'isArchived']);
  await logAudit({ actor: req.user, action: 'provider.package_update', entityType: 'provider', entityId: provider._id, changes });
  res.json({ package: pkg });
}

// PUT /api/providers/me/blocked-dates: replaces the whole list of dates the provider is unavailable
export async function saveBlockedDates(req, res) {
  const provider = await myProfileOrFail(req.user);
  provider.blockedDates = [...req.body.blockedDates].sort((a, b) => a.date - b.date);
  await provider.save();
  await logAudit({
    actor: req.user, action: 'provider.availability_update', entityType: 'provider', entityId: provider._id,
    changes: [{ field: 'blockedDates', from: null, to: `${provider.blockedDates.length} date(s)` }],
  });
  res.json({ blockedDates: provider.blockedDates });
}

// ---------- Viewing providers (any logged-in user) ----------

// "TRL-2024-0912" -> "••••0912": enough to recognise the document, without publishing the full number.
function maskNumber(number) {
  return number.length <= 4 ? number : `••••${number.slice(-4)}`;
}

// GET /api/providers/:id: public profile with the credentials an admin has reviewed.
export async function getPublic(req, res) {
  const provider = await ProviderProfile.findById(req.params.id).lean();
  if (!provider) throw httpError(404, 'Provider not found');

  const [owner, credentials] = await Promise.all([
    User.findById(provider.user).select('approvalStatus').lean(),
    Credential.find({ provider: provider._id, status: 'approved' }).sort({ reviewedAt: -1 }).lean(),
  ]);

  // Show the latest approved document of each type, and say whether it is still valid.
  const reviewedCredentials = [];
  for (const credential of credentials) {
    if (reviewedCredentials.some((c) => c.type === credential.type)) continue; // older one of same type
    reviewedCredentials.push({
      type: credential.type,
      label: CREDENTIAL_LABELS[credential.type],
      number: maskNumber(credential.number),
      reviewedAt: credential.reviewedAt,
      expiresAt: credential.expiresAt,
      valid: isCredentialValid(credential),
    });
  }

  res.json({
    provider: {
      ...provider,
      packages: provider.packages.filter((p) => !p.isArchived),
      blockedDates: provider.blockedDates.map((b) => b.date), // reasons are private
    },
    bookability: evaluateBookability(provider, owner || { approvalStatus: 'pending' }, credentials),
    reviewedCredentials,
  });
}

// GET /api/providers?category=&division=&q=: simple directory of approved providers.
// (M2-B adds the full search with location, budget, date and guest count.)
export async function directory(req, res) {
  const { category, division, q } = req.validQuery;
  const approvedOwners = await User.find({ role: 'provider', approvalStatus: 'approved' }).distinct('_id');

  const filter = { user: { $in: approvedOwners } };
  if (category) filter.category = category;
  if (division) filter.$or = [{ division }, { 'serviceAreas.division': division }];
  if (q) filter.businessName = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }; // escape regex symbols

  const providers = await ProviderProfile.find(filter).sort({ businessName: 1 }).limit(100).lean();
  const bookability = await bookabilityForMany(providers);

  res.json({
    providers: providers.map((p) => {
      const active = p.packages.filter((pkg) => !pkg.isArchived);
      return {
        _id: p._id,
        businessName: p.businessName,
        category: p.category,
        division: p.division,
        district: p.district,
        tags: p.tags,
        capacity: p.capacity,
        reviewCount: p.reviewCount,
        packageCount: active.length,
        priceFrom: active.length ? Math.min(...active.map((pkg) => pkg.price)) : null,
        bookable: bookability.get(String(p._id)).bookable,
      };
    }),
  });
}
