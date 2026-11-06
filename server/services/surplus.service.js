import { SurplusListing } from '../models/SurplusListing.js';
import { ALLERGEN_LABELS } from '../config/constants.js';

const round = (n) => Math.round(n * 100) / 100;

// ---------- Listing helpers ----------

// What a coordinator would want to know but the poster did not say.
export function computeMissingInfo(listing) {
  const missing = [];
  if (!listing.allergensDeclared) missing.push('allergens');
  if (!listing.ingredients?.length) missing.push('ingredients');
  if (!listing.preparation?.preparedAt) missing.push('preparation time');
  if (!listing.storageCondition) missing.push('storage condition');
  return missing;
}

// "Kacchi  Biryani!" -> "kacchibiryani" (so small spelling/spacing differences still match)
const normalizeFood = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

// The calendar day in Bangladesh time (UTC+6), e.g. "2026-11-06".
const dhakaDay = (date) => new Date(new Date(date).getTime() + 6 * 3600 * 1000).toISOString().slice(0, 10);

// Same pickup day + same pickup place + same food => same key => the unique index refuses a duplicate.
// The place is the map pin rounded to 3 decimals (about 100 m), or district + address without a pin.
// This is how a host and their caterer at the same venue can't both list the same leftovers.
export function makeDedupeKey(listing) {
  const loc = listing.pickupLocation;
  const place = loc.lat && loc.lng
    ? `${loc.lat.toFixed(3)},${loc.lng.toFixed(3)}`
    : `${loc.district}:${normalizeFood(loc.address || '')}`;
  return `${dhakaDay(listing.pickupDeadline)}|${place}|${normalizeFood(listing.foodType)}`;
}

export function availableOf(listing) {
  return round(listing.quantityTotal - listing.quantityReserved - listing.quantityWastedUnreserved);
}

// LAZY EXPIRY: no timer runs on serverless, so whenever listings are read we close the ones whose
// pickup deadline has passed. ($unset the dedupeKey so the "lock" is released.)
// The reservation guard also checks the deadline, so this is about tidy statuses, not correctness.
export function closeExpiredListings(now = new Date()) {
  return SurplusListing.updateMany(
    { status: { $in: ['open', 'fully_reserved'] }, pickupDeadline: { $lte: now } },
    { $set: { status: 'closed' }, $unset: { dedupeKey: 1 } }
  );
}

// ---------- The over-reservation guard ----------

// Atomically take `quantity` from a listing, ONLY IF it is open, not expired and has enough left.
// Check and change happen in one database operation, so two coordinators reserving at the same
// moment can never take more than the stock. Returns the updated listing, or null if refused.
export function reserveQuantity(listingId, quantity, now = new Date()) {
  return SurplusListing.findOneAndUpdate(
    {
      _id: listingId,
      status: 'open',
      pickupDeadline: { $gt: now },
      // $expr compares fields of the same document: total - reserved - wasted >= quantity
      $expr: {
        $gte: [{ $subtract: ['$quantityTotal', { $add: ['$quantityReserved', '$quantityWastedUnreserved'] }] }, quantity],
      },
    },
    { $inc: { quantityReserved: quantity } },
    { returnDocument: 'after' }
  );
}

// Give quantity back (cancelled or missed reservation). Re-opens the listing if it is still before the deadline.
export async function releaseQuantity(listingId, quantity) {
  const listing = await SurplusListing.findOneAndUpdate(
    { _id: listingId, quantityReserved: { $gte: quantity } },
    { $inc: { quantityReserved: -quantity } },
    { returnDocument: 'after' }
  );
  if (listing) await refreshListingStatus(listing);
  return listing;
}

// open <-> fully_reserved, depending on what is left. Never touches closed/cancelled/completed listings.
export async function refreshListingStatus(listing) {
  const left = availableOf(listing);
  if (listing.status === 'open' && left <= 0) {
    await SurplusListing.updateOne({ _id: listing._id, status: 'open' }, { status: 'fully_reserved' });
  } else if (listing.status === 'fully_reserved' && left > 0 && listing.pickupDeadline > new Date()) {
    await SurplusListing.updateOne({ _id: listing._id, status: 'fully_reserved' }, { status: 'open' });
  }
}

// ---------- Matching ----------

// Straight-line distance in km between two { lat, lng } points (haversine formula).
export function distanceKm(a, b) {
  if (!a?.lat || !b?.lat) return null;
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// Rank open listings for one food request, with readable reasons and a suggested quantity.
// Pure function: listings and request in, ranked matches out.
export function matchListings(request, listings, now = new Date()) {
  const stillNeeded = Math.max(0, request.quantityNeeded - request.quantityMatched);
  const matches = [];
  let hiddenForAllergens = 0;

  for (const listing of listings) {
    const available = availableOf(listing);
    if (listing.unit !== request.unit || available <= 0 || listing.pickupDeadline <= now) continue;
    if (listing.pickupLocation.division !== request.division) continue;

    // Safety first: never suggest food that contains an allergen the organization must avoid.
    const conflicts = listing.allergens.filter((a) => request.avoidAllergens.includes(a));
    if (conflicts.length) {
      hiddenForAllergens += 1;
      continue;
    }

    let score = 0;
    const reasons = [];
    const warnings = [];

    if (listing.pickupLocation.district === request.district) {
      score += 30;
      reasons.push(`Same district (${request.district})`);
    } else {
      score += 10;
      reasons.push(`Same division (${request.division})`);
    }

    const km = distanceKm(listing.pickupLocation, request.location);
    if (km !== null) {
      score += km <= 5 ? 25 : km <= 15 ? 12 : 0;
      reasons.push(`${km.toFixed(1)} km away`);
    }

    // Can they collect before the deadline? Some availability window must overlap [now, deadline].
    const window = request.availability.find((w) => w.from < listing.pickupDeadline && w.to > now);
    if (window) {
      score += 25;
      reasons.push('You are available to collect before the deadline');
    } else {
      warnings.push('None of your collection windows is before the pickup deadline');
    }

    // Suggested quantity: the smallest of what is left, what you still need, what you can receive and carry.
    const limits = [
      { value: available, why: 'what is left' },
      { value: stillNeeded, why: 'what you still need' },
      { value: request.receivingCapacity, why: 'your receiving capacity' },
      { value: request.collectionCapacity, why: 'your collection capacity' },
    ];
    const smallest = limits.reduce((min, l) => (l.value < min.value ? l : min));
    const suggestedQuantity = round(Math.max(0, smallest.value));
    if (suggestedQuantity >= stillNeeded && stillNeeded > 0) {
      score += 20;
      reasons.push('Covers everything you still need');
    }

    if (request.avoidAllergens.length && !listing.allergensDeclared) {
      warnings.push(`Allergens not declared: check for ${request.avoidAllergens.map((a) => ALLERGEN_LABELS[a]).join(', ')} before accepting`);
    }
    if (listing.missingInfo.length) warnings.push(`Missing information: ${listing.missingInfo.join(', ')}`);

    matches.push({
      listing,
      available,
      score,
      reasons,
      warnings,
      suggestedQuantity,
      suggestedBecause: `Limited by ${smallest.why}`,
    });
  }

  // Best score first; for equal scores, the most urgent deadline first.
  matches.sort((a, b) => b.score - a.score || a.listing.pickupDeadline - b.listing.pickupDeadline);
  return { stillNeeded, matches: matches.slice(0, 20), hiddenForAllergens };
}
