import { FoodRequest } from '../models/FoodRequest.js';
import { Reservation } from '../models/Reservation.js';
import { SurplusListing } from '../models/SurplusListing.js';
import { Organization } from '../models/Organization.js';
import {
  closeExpiredListings, matchListings, reserveQuantity, releaseQuantity, refreshListingStatus, availableOf,
} from '../services/surplus.service.js';
import { logAudit } from '../services/audit.service.js';
import { notifyUsers } from '../services/notify.service.js';
import { httpError } from '../utils/httpError.js';

// A coordinator always works for their own organization.
function orgIdOf(user) {
  if (!user.organization) throw httpError(403, 'Your account is not linked to an organization');
  return user.organization;
}

// Recalculate a request's status from how much has been matched.
async function refreshRequestStatus(requestId) {
  const request = await FoodRequest.findById(requestId);
  if (!request || request.status === 'cancelled') return;
  const status = request.quantityMatched >= request.quantityNeeded ? 'fulfilled' : request.quantityMatched > 0 ? 'partially_matched' : 'open';
  if (status !== request.status) await FoodRequest.updateOne({ _id: requestId }, { status });
}

// ---------- Food requests ----------

// POST /api/food-requests
export async function createRequest(req, res) {
  const organization = await Organization.findById(orgIdOf(req.user));
  const request = await FoodRequest.create({
    ...req.body,
    organization: organization._id,
    coordinator: req.user._id,
    orgType: organization.type,
    division: organization.division,
    district: organization.district,
    location: organization.location,
  });
  await logAudit({ actor: req.user, action: 'food_request.create', entityType: 'food_request', entityId: request._id, changes: [{ field: 'quantityNeeded', from: null, to: request.quantityNeeded }] });
  res.status(201).json({ request });
}

// GET /api/food-requests/mine: my organization's requests with their reservations.
export async function listMyRequests(req, res) {
  const organization = orgIdOf(req.user);
  const requests = await FoodRequest.find({ organization }).sort({ createdAt: -1 });
  const reservations = await Reservation.find({ organization })
    .populate({ path: 'listing', select: 'foodType unit pickupDeadline pickupLocation status postedBy', populate: { path: 'postedBy', select: 'name' } })
    .sort({ createdAt: -1 });
  res.json({
    requests: requests.map((r) => ({
      ...r.toObject(),
      reservations: reservations.filter((x) => String(x.request) === String(r._id)),
    })),
  });
}

// PATCH /api/food-requests/:id
export async function updateRequest(req, res) {
  const request = await FoodRequest.findOne({ _id: req.params.id, organization: orgIdOf(req.user) });
  if (!request) throw httpError(404, 'Request not found');
  if (request.status === 'cancelled') throw httpError(409, 'This request is cancelled');
  if (req.body.quantityNeeded < request.quantityMatched) {
    throw httpError(409, `You already reserved ${request.quantityMatched}; the need can't be lower than that`);
  }
  request.set(req.body);
  await request.save();
  await refreshRequestStatus(request._id);
  res.json({ request });
}

// POST /api/food-requests/:id/cancel: only when it has no active reservations.
export async function cancelRequest(req, res) {
  const request = await FoodRequest.findOne({ _id: req.params.id, organization: orgIdOf(req.user) });
  if (!request) throw httpError(404, 'Request not found');
  if (await Reservation.exists({ request: request._id, status: 'reserved' })) {
    throw httpError(409, 'Cancel the reservations of this request first');
  }
  request.status = 'cancelled';
  await request.save();
  await logAudit({ actor: req.user, action: 'food_request.cancel', entityType: 'food_request', entityId: request._id, reason: req.body.reason });
  res.json({ request });
}

// GET /api/food-requests/:id/matches: suitable open listings, ranked, with reasons.
export async function getMatches(req, res) {
  const request = await FoodRequest.findOne({ _id: req.params.id, organization: orgIdOf(req.user) });
  if (!request) throw httpError(404, 'Request not found');

  await closeExpiredListings();
  const listings = await SurplusListing.find({
    status: 'open',
    unit: request.unit,
    'pickupLocation.division': request.division,
    pickupDeadline: { $gt: new Date() },
  }).populate('postedBy', 'name role');

  res.json({ request, ...matchListings(request, listings) });
}

// ---------- Reservations ----------

// POST /api/reservations   body: { listingId, requestId, quantity }   header: Idempotency-Key
export async function createReservation(req, res) {
  const organization = orgIdOf(req.user);
  const { listingId, requestId, quantity } = req.body;

  // 1) Idempotency: the same key means the same click sent twice, so return the first result.
  const key = req.get('Idempotency-Key');
  if (key) {
    const previous = await Reservation.findOne({ idempotencyKey: key });
    if (previous) return res.status(200).json({ reservation: previous, repeated: true });
  }

  // 2) Business checks on the request.
  const request = await FoodRequest.findOne({ _id: requestId, organization, status: { $in: ['open', 'partially_matched'] } });
  if (!request) throw httpError(404, 'Open request not found');
  const listingBefore = await SurplusListing.findById(listingId);
  if (!listingBefore) throw httpError(404, 'Listing not found');
  if (listingBefore.unit !== request.unit) throw httpError(400, `This listing is in ${listingBefore.unit}, your request in ${request.unit}`);
  const capacity = Math.min(request.receivingCapacity, request.collectionCapacity);
  if (quantity > capacity) throw httpError(400, `That is more than you can receive or carry (${capacity} ${request.unit})`);
  const stillNeeded = request.quantityNeeded - request.quantityMatched;
  if (quantity > stillNeeded) throw httpError(400, `You only still need ${stillNeeded} ${request.unit}`);

  // 3) THE GUARD: atomically take the quantity, or get null if there isn't enough (or it expired).
  const listing = await reserveQuantity(listingId, quantity);
  if (!listing) {
    const now = await SurplusListing.findById(listingId);
    if (now.pickupDeadline <= new Date()) throw httpError(409, 'This listing has passed its pickup deadline');
    if (now.status !== 'open') throw httpError(409, `This listing is ${now.status.replace('_', ' ')}`);
    throw httpError(409, `Only ${availableOf(now)} ${now.unit} left. Someone reserved part of it just now.`, undefined, { available: availableOf(now) });
  }

  // 4) Record the reservation. If that fails, give the quantity back so nothing is lost.
  let reservation;
  try {
    reservation = await Reservation.create({
      listing: listing._id,
      request: request._id,
      organization,
      coordinator: req.user._id,
      unit: listing.unit,
      quantityReserved: quantity,
      idempotencyKey: key || undefined,
      history: [{ action: 'reserved', by: req.user._id, note: `${quantity} ${listing.unit}` }],
    });
  } catch (err) {
    await SurplusListing.updateOne({ _id: listing._id }, { $inc: { quantityReserved: -quantity } });
    if (err.code === 11000 && key) {
      return res.status(200).json({ reservation: await Reservation.findOne({ idempotencyKey: key }), repeated: true });
    }
    throw err;
  }

  await refreshListingStatus(listing);
  await FoodRequest.updateOne({ _id: request._id }, { $inc: { quantityMatched: quantity } });
  await refreshRequestStatus(request._id);

  await logAudit({ actor: req.user, action: 'reservation.create', entityType: 'reservation', entityId: reservation._id, changes: [{ field: 'quantity', from: null, to: `${quantity} ${listing.unit} of ${listing.foodType}` }] });
  await notifyUsers([listing.postedBy], {
    type: 'reservation.new',
    title: `${quantity} ${listing.unit} of ${listing.foodType} reserved`,
    body: `${req.user.name} reserved part of your surplus.`,
    link: '/surplus/mine',
  });

  res.status(201).json({ reservation });
}

// GET /api/reservations: coordinators see their organization's; posters see those on their listings.
export async function listReservations(req, res) {
  let filter;
  if (req.user.organization) filter = { organization: req.user.organization };
  else filter = { listing: { $in: await SurplusListing.find({ postedBy: req.user._id }).distinct('_id') } };

  const reservations = await Reservation.find(filter)
    .populate('listing', 'foodType unit pickupDeadline pickupLocation')
    .populate('organization', 'name type')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ reservations });
}

// POST /api/reservations/:id/cancel   body: { reason }
// Gives the uncollected quantity back to the listing (it re-opens if still before the deadline).
export async function cancelReservation(req, res) {
  const organization = orgIdOf(req.user);
  const existing = await Reservation.findOne({ _id: req.params.id, organization });
  if (!existing) throw httpError(404, 'Reservation not found');

  // Guarded: only a reservation that is still just "reserved" (nothing collected) can be cancelled.
  const reservation = await Reservation.findOneAndUpdate(
    { _id: existing._id, status: 'reserved' },
    {
      $set: { status: 'cancelled', quantityReleased: existing.quantityReserved },
      $push: { history: { action: 'cancelled', by: req.user._id, note: req.body.reason } },
    },
    { returnDocument: 'after' }
  );
  if (!reservation) throw httpError(409, `This reservation is ${existing.status} and can no longer be cancelled`);

  const listing = await releaseQuantity(reservation.listing, reservation.quantityReserved);
  await FoodRequest.updateOne({ _id: reservation.request }, { $inc: { quantityMatched: -reservation.quantityReserved } });
  await refreshRequestStatus(reservation.request);

  await logAudit({ actor: req.user, action: 'reservation.cancel', entityType: 'reservation', entityId: reservation._id, changes: [{ field: 'status', from: 'reserved', to: 'cancelled' }], reason: req.body.reason });
  if (listing) {
    await notifyUsers([listing.postedBy], {
      type: 'reservation.cancelled',
      title: `Reservation cancelled: ${reservation.quantityReserved} ${listing.unit} ${listing.foodType}`,
      body: req.body.reason,
      link: '/surplus/mine',
    });
  }
  res.json({ reservation });
}
