import { ProviderProfile } from '../models/ProviderProfile.js';
import { Credential } from '../models/Credential.js';
import { User } from '../models/User.js';
import { REQUIRED_CREDENTIALS, CREDENTIAL_LABELS } from '../config/constants.js';
import { notifyUsers } from './notify.service.js';
import { httpError } from '../utils/httpError.js';

const day = (date) => new Date(date).toISOString().slice(0, 10); // 2027-03-31

// A credential counts only if an admin approved it AND it has not expired yet.
export function isCredentialValid(credential, now = new Date()) {
  return credential.status === 'approved' && new Date(credential.expiresAt) > now;
}

// THE BOOKABLE RULE. A provider may accept new quotes/bookings only when:
//  1. an admin approved the provider's account, and
//  2. every document required for its category is approved and not expired.
// Returns { bookable, reasons } so the UI can explain exactly what is missing.
export function evaluateBookability(provider, user, credentials, now = new Date()) {
  const reasons = [];
  if (user.approvalStatus !== 'approved') reasons.push('Account not yet approved by an administrator');

  for (const type of REQUIRED_CREDENTIALS[provider.category]) {
    const label = CREDENTIAL_LABELS[type];
    const ofType = credentials.filter((c) => c.type === type);
    if (ofType.some((c) => isCredentialValid(c, now))) continue; // this requirement is met

    const expired = ofType.find((c) => c.status === 'approved'); // approved once, but out of date
    if (expired) reasons.push(`${label} expired on ${day(expired.expiresAt)}`);
    else if (ofType.some((c) => c.status === 'pending')) reasons.push(`${label} is waiting for admin review`);
    else reasons.push(`${label} is missing (upload it under Credentials)`);
  }
  return { bookable: reasons.length === 0, reasons };
}

// Same rule for many providers at once, with only two extra queries (used by lists and search).
// Returns a Map: providerId (string) -> { bookable, reasons }
export async function bookabilityForMany(providers) {
  const providerIds = providers.map((p) => p._id);
  const [credentials, users] = await Promise.all([
    Credential.find({ provider: { $in: providerIds } }).lean(),
    User.find({ _id: { $in: providers.map((p) => p.user) } }).select('approvalStatus').lean(),
  ]);
  const result = new Map();
  for (const provider of providers) {
    const user = users.find((u) => String(u._id) === String(provider.user)) || { approvalStatus: 'pending' };
    const own = credentials.filter((c) => String(c.provider) === String(provider._id));
    result.set(String(provider._id), evaluateBookability(provider, user, own));
  }
  return result;
}

// Used before creating a quote request or booking (M3-C): throws 409 with the reasons.
export async function assertBookable(providerId) {
  const provider = await ProviderProfile.findById(providerId);
  if (!provider) throw httpError(404, 'Provider not found');
  const status = (await bookabilityForMany([provider])).get(String(provider._id));
  if (!status.bookable) {
    throw httpError(409, `${provider.businessName} cannot accept bookings right now: ${status.reasons.join('; ')}`);
  }
  return provider;
}

// EXPIRY CHECK. Finds approved documents whose expiry date has passed and warns the provider once.
// New bookings are already blocked by evaluateBookability (it compares dates every time);
// this function adds the warning, and M3-C extends it to flag the provider's upcoming bookings.
export async function runExpiryCheck(now = new Date()) {
  const expired = await Credential.find({ status: 'approved', expiresAt: { $lte: now }, expiryNotifiedAt: null })
    .populate('provider', 'user businessName');

  let handled = 0;
  for (const credential of expired) {
    // Atomic claim: if two checks run at the same time, only one of them notifies.
    const claimed = await Credential.findOneAndUpdate(
      { _id: credential._id, expiryNotifiedAt: null },
      { expiryNotifiedAt: now }
    );
    if (!claimed) continue;
    handled += 1;
    await notifyUsers([credential.provider.user], {
      type: 'credential.expired',
      title: `${CREDENTIAL_LABELS[credential.type]} has expired`,
      body: `It expired on ${day(credential.expiresAt)}. New bookings are blocked until you upload a renewed document.`,
      link: '/provider/credentials',
    });
  }
  return { expiredFound: handled };
}
