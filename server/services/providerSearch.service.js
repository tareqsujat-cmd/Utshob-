import { ProviderProfile } from '../models/ProviderProfile.js';
import { User } from '../models/User.js';
import { PROVIDER_CATEGORY_LABELS, PROVIDER_TAG_LABELS } from '../config/constants.js';
import { bookabilityForMany } from './provider.service.js';
import { distanceKm } from './surplus.service.js';

const MAX_PER_CATEGORY = 10;
const LIMITED_HISTORY_BELOW = 3; // fewer completed bookings than this = "limited history"
const taka = (n) => `৳${Math.round(n).toLocaleString('en-IN')}`;
const sameDay = (a, b) => new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

// The cheapest active package that fits the guest count, and what it would cost for this event.
export function bestPackage(provider, guestCount) {
  const options = provider.packages
    .filter((p) => !p.isArchived && guestCount >= p.minGuests && guestCount <= p.maxGuests)
    .map((p) => ({ package: p, cost: p.pricingType === 'per_guest' ? p.price * guestCount : p.price }));
  options.sort((a, b) => a.cost - b.cost);
  return options[0] || null;
}

// Score one provider for the criteria. Returns null if a HARD rule excludes it
// (with the reason counted in `excluded`), otherwise { score, reasons, flags, ... }.
// HARD rules remove a provider; SOFT problems keep it but add a warning flag and lower the score,
// so the host still sees "almost suitable" options and why they aren't perfect.
export function scoreProvider(provider, criteria, context, excluded) {
  const { bookable, venue } = context;

  // HARD rules: the first one that fails removes the provider, and we count why.
  const serves = provider.serviceAreas.some((a) => a.division === criteria.location.division);
  const blocked = criteria.date && provider.blockedDates.some((b) => sameDay(b.date, criteria.date));
  const missing = criteria.services.filter((tag) => !provider.tags.includes(tag));
  let hardReason = null;
  if (!bookable) hardReason = 'notBookable';
  else if (!serves) hardReason = 'notServingArea';
  else if (blocked) hardReason = 'unavailableOnDate';
  else if (missing.length) hardReason = 'missingServices';
  if (hardReason) {
    excluded[hardReason] += 1;
    return null;
  }

  let score = 50;
  const reasons = [`Credentials reviewed, serves ${criteria.location.division}`];
  const flags = [];

  // Location
  const km = distanceKm(criteria.location, provider.location);
  if (provider.district === criteria.location.district) {
    score += 10;
    reasons.push(`Based in ${provider.district}`);
  }
  if (km !== null) {
    score += km <= 5 ? 15 : km <= 15 ? 8 : 0;
    reasons.push(`${km.toFixed(1)} km from your location`);
  }
  if (criteria.date) reasons.push('Not blocked on your date');
  if (criteria.services.length) reasons.push(`Offers ${criteria.services.map((t) => PROVIDER_TAG_LABELS[t]).join(', ')}`);

  // Preferences: nice to have
  for (const tag of criteria.preferences) {
    if (provider.tags.includes(tag)) {
      score += 5;
      reasons.push(`Has ${PROVIDER_TAG_LABELS[tag].toLowerCase()} (your preference)`);
    }
  }

  // Price vs budget
  const best = bestPackage(provider, criteria.guestCount);
  const budget = criteria.budgets[provider.category];
  if (!best) {
    score -= 25;
    flags.push(`No package for ${criteria.guestCount} guests`);
  } else if (budget) {
    if (best.cost <= budget) {
      score += best.cost <= budget * 0.8 ? 20 : 12;
      reasons.push(`"${best.package.name}" ≈ ${taka(best.cost)}, within your ${taka(budget)} budget`);
    } else {
      score -= 25;
      flags.push(`Over your budget by ${taka(best.cost - budget)} (≈ ${taka(best.cost)})`);
    }
  }

  // Capacity (venues must hold everyone; caterers must serve everyone)
  const cap = provider.capacity || { min: 0, max: 0 };
  if (cap.max > 0 && criteria.guestCount > cap.max) {
    score -= 30;
    flags.push(`Capacity conflict: holds up to ${cap.max}, you expect ${criteria.guestCount}`);
  } else if (cap.min > 0 && criteria.guestCount < cap.min) {
    score -= 10;
    flags.push(`Minimum ${cap.min} guests, you expect ${criteria.guestCount}`);
  } else if (cap.max > 0) {
    reasons.push(`Capacity ${cap.min}–${cap.max} fits ${criteria.guestCount} guests`);
  }

  // Outside catering rules
  if (provider.category === 'venue' && !provider.allowsOutsideCatering && criteria.categories.includes('caterer')) {
    flags.push('In-house catering only: outside caterers are not allowed here');
  }
  if (['caterer', 'restaurant'].includes(provider.category) && venue && !venue.allowsOutsideCatering) {
    score -= 30;
    flags.push(`${venue.businessName} does not allow outside catering`);
  }

  // History: review count, and a label when there's little to judge by
  const limitedHistory = provider.completedBookings < LIMITED_HISTORY_BELOW;
  if (provider.reviewCount > 0) score += Math.round(provider.ratingAvg * 2);

  return {
    score,
    reasons,
    flags,
    estimatedCost: best?.cost ?? null,
    package: best?.package ?? null,
    distanceKm: km === null ? null : Number(km.toFixed(1)),
    limitedHistory,
  };
}

// Search registered providers for each requested category. Up to 10 per category, best first;
// problems-free results before flagged ones. Explains when fewer were found and why.
export async function searchProviders(criteria) {
  const approvedOwners = await User.find({ role: 'provider', approvalStatus: 'approved' }).distinct('_id');
  const providers = await ProviderProfile.find({ user: { $in: approvedOwners }, category: { $in: criteria.categories } }).lean();
  const bookability = await bookabilityForMany(providers);
  const venue = criteria.venueId ? await ProviderProfile.findById(criteria.venueId).lean() : null;

  const results = {};
  for (const category of criteria.categories) {
    const excluded = { notBookable: 0, notServingArea: 0, unavailableOnDate: 0, missingServices: 0 };
    const matches = [];
    for (const provider of providers.filter((p) => p.category === category)) {
      const scored = scoreProvider(provider, criteria, { bookable: bookability.get(String(provider._id)).bookable, venue }, excluded);
      if (scored) {
        matches.push({
          provider: {
            _id: provider._id, businessName: provider.businessName, category, division: provider.division,
            district: provider.district, address: provider.address, location: provider.location, tags: provider.tags,
            capacity: provider.capacity, allowsOutsideCatering: provider.allowsOutsideCatering,
            reviewCount: provider.reviewCount, ratingAvg: provider.ratingAvg, completedBookings: provider.completedBookings,
          },
          ...scored,
        });
      }
    }
    // No flags first, then by score.
    matches.sort((a, b) => (a.flags.length > 0) - (b.flags.length > 0) || b.score - a.score);
    const top = matches.slice(0, MAX_PER_CATEGORY);

    const label = PROVIDER_CATEGORY_LABELS[category].toLowerCase();
    const note = top.length === 0
      ? `No ${label} matches these criteria.`
      : top.length < MAX_PER_CATEGORY ? `Only ${top.length} ${label} option(s) match. Showing all of them.` : null;
    results[category] = { results: top, totalMatched: matches.length, note, excluded };
  }
  return results;
}
