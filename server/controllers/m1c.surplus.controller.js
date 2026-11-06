import { SurplusListing } from '../models/SurplusListing.js';
import { ProviderProfile } from '../models/ProviderProfile.js';
import { Organization } from '../models/Organization.js';
import { Reservation } from '../models/Reservation.js';
import { COORDINATOR_ROLES } from '../config/constants.js';
import { findEventForUser } from '../services/event.service.js';
import {
  computeMissingInfo, makeDedupeKey, closeExpiredListings, availableOf, refreshListingStatus,
} from '../services/surplus.service.js';
import { logAudit } from '../services/audit.service.js';
import { notifyUsers } from '../services/notify.service.js';
import { httpError } from '../utils/httpError.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const withAvailable = (listing) => ({ ...listing.toObject(), available: availableOf(listing) });

// POST /api/surplus: a host (for one of their events) or an approved provider offers surplus food.
export async function createListing(req, res) {
  const { eventId, preparedAt, preparationMethod, ...data } = req.body;
  let event = null;
  let provider = null;

  if (req.user.role === 'host') {
    if (!eventId) throw httpError(400, 'Choose the event the food comes from', [{ field: 'eventId', message: 'Required for hosts' }]);
    event = await findEventForUser(eventId, req.user); // 404 unless the host organizes it
    if (event.status === 'draft') throw httpError(409, 'A draft event has no food to share yet');
  } else {
    provider = await ProviderProfile.findOne({ user: req.user._id });
    if (!provider) throw httpError(400, 'Create your business profile first');
  }

  const listing = new SurplusListing({
    ...data,
    preparation: { preparedAt, method: preparationMethod },
    postedBy: req.user._id,
    postedByRole: req.user.role,
    event: event?._id,
    provider: provider?._id,
  });
  listing.missingInfo = computeMissingInfo(listing);
  listing.dedupeKey = makeDedupeKey(listing);

  try {
    await listing.save();
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Duplicate key: the same food at the same place on the same day is already listed.
    const existing = await SurplusListing.findOne({ dedupeKey: listing.dedupeKey }).populate('postedBy', 'name role');
    throw httpError(
      409,
      `This surplus is already listed by ${existing?.postedBy?.name || 'someone'} (${existing?.postedByRole || 'unknown'}) for the same place and day. ` +
        'Coordinate with them instead of listing it twice.',
      undefined,
      { existingListingId: existing?._id }
    );
  }

  await logAudit({
    actor: req.user, action: 'surplus.create', entityType: 'surplus', entityId: listing._id,
    changes: [{ field: 'quantity', from: null, to: `${listing.quantityTotal} ${listing.unit} ${listing.foodType}` }],
  });
  // Tell coordinators in the same division that food is available.
  const coordinators = await Organization.find({ division: listing.pickupLocation.division, approvalStatus: 'approved' }).distinct('coordinators');
  await notifyUsers(coordinators, {
    type: 'surplus.new',
    title: `New surplus: ${listing.quantityTotal} ${listing.unit} ${listing.foodType}`,
    body: `Pickup in ${listing.pickupLocation.district} before ${listing.pickupDeadline.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}.`,
    link: `/surplus/${listing._id}`,
  });

  res.status(201).json({ listing: withAvailable(listing) });
}

// GET /api/surplus?division=&district=&q=: open listings for coordinators (expired ones closed first).
export async function listOpenListings(req, res) {
  await closeExpiredListings();
  const { division, district, q } = req.validQuery;
  const filter = { status: 'open' };
  if (division) filter['pickupLocation.division'] = division;
  if (district) filter['pickupLocation.district'] = district;
  if (q) filter.foodType = { $regex: escapeRegex(q), $options: 'i' };

  const listings = await SurplusListing.find(filter).sort({ pickupDeadline: 1 }).limit(100).populate('postedBy', 'name');
  res.json({ listings: listings.map(withAvailable) });
}

// GET /api/surplus/mine: my listings and who reserved them.
export async function listMyListings(req, res) {
  await closeExpiredListings();
  const listings = await SurplusListing.find({ postedBy: req.user._id }).sort({ createdAt: -1 }).populate('event', 'title');
  const reservations = await Reservation.find({ listing: { $in: listings.map((l) => l._id) } }).populate('organization', 'name type');
  res.json({
    listings: listings.map((l) => ({
      ...withAvailable(l),
      reservations: reservations.filter((r) => String(r.listing) === String(l._id)),
    })),
  });
}

// Who may see one listing: its poster, approved coordinators, admins.
function canView(listing, user) {
  if (user.role === 'admin') return true;
  if (String(listing.postedBy._id || listing.postedBy) === String(user._id)) return true;
  return COORDINATOR_ROLES.includes(user.role) && user.approvalStatus === 'approved';
}

// GET /api/surplus/:id
export async function getListing(req, res) {
  await closeExpiredListings();
  const listing = await SurplusListing.findById(req.params.id).populate('postedBy', 'name role').populate('event', 'title startsAt');
  if (!listing || !canView(listing, req.user)) throw httpError(404, 'Listing not found');
  const reservations = await Reservation.find({ listing: listing._id }).populate('organization', 'name type').sort({ createdAt: 1 });
  res.json({ listing: withAvailable(listing), reservations });
}

// PATCH /api/surplus/:id: the poster corrects details or the quantity.
// The total can't go below what is already reserved (checked inside the update, atomically).
export async function updateListing(req, res) {
  const { preparedAt, preparationMethod, ...fields } = req.body;
  const updated = await SurplusListing.findOneAndUpdate(
    {
      _id: req.params.id,
      postedBy: req.user._id,
      status: { $in: ['open', 'fully_reserved'] },
      $expr: { $lte: [{ $add: ['$quantityReserved', '$quantityWastedUnreserved'] }, fields.quantityTotal] },
    },
    { $set: { ...fields, preparation: { preparedAt, method: preparationMethod } } },
    { returnDocument: 'after' }
  );
  if (!updated) {
    const listing = await SurplusListing.findOne({ _id: req.params.id, postedBy: req.user._id });
    if (!listing) throw httpError(404, 'Listing not found');
    if (!['open', 'fully_reserved'].includes(listing.status)) throw httpError(409, `This listing is ${listing.status} and can't be changed`);
    throw httpError(409, `Quantity can't be lower than what is already reserved (${listing.quantityReserved} ${listing.unit})`);
  }
  updated.missingInfo = computeMissingInfo(updated);
  await updated.save();
  await refreshListingStatus(updated);

  await logAudit({ actor: req.user, action: 'surplus.update', entityType: 'surplus', entityId: updated._id, changes: [{ field: 'quantityTotal', from: null, to: updated.quantityTotal }] });
  res.json({ listing: withAvailable(updated) });
}

// POST /api/surplus/:id/cancel   body: { reason }: only while nothing is reserved.
export async function cancelListing(req, res) {
  const listing = await SurplusListing.findOneAndUpdate(
    { _id: req.params.id, postedBy: req.user._id, status: 'open', quantityReserved: 0 },
    { $set: { status: 'cancelled', cancelReason: req.body.reason }, $unset: { dedupeKey: 1 } },
    { returnDocument: 'after' }
  );
  if (!listing) {
    const exists = await SurplusListing.exists({ _id: req.params.id, postedBy: req.user._id });
    throw httpError(exists ? 409 : 404, exists ? 'Only an open listing with no reservations can be cancelled' : 'Listing not found');
  }
  await logAudit({ actor: req.user, action: 'surplus.cancel', entityType: 'surplus', entityId: listing._id, changes: [{ field: 'status', from: 'open', to: 'cancelled' }], reason: req.body.reason });
  res.json({ listing: withAvailable(listing) });
}
