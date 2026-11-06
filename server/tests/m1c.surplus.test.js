import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDB, stopTestDB, resetTestDB, makeUser, api } from './helpers.js';
import { Organization } from '../models/Organization.js';
import { ProviderProfile } from '../models/ProviderProfile.js';
import { SurplusListing } from '../models/SurplusListing.js';
import { Reservation } from '../models/Reservation.js';
import { FoodRequest } from '../models/FoodRequest.js';
import { Event } from '../models/Event.js';

beforeAll(startTestDB);
afterAll(stopTestDB);
beforeEach(resetTestDB);

const hoursFromNow = (h) => new Date(Date.now() + h * 3600000).toISOString();
const venuePin = { address: 'Road 27, Dhanmondi', division: 'Dhaka', district: 'Dhaka', lat: 23.7461, lng: 90.3742 };

async function makeHostWithEvent() {
  const host = await makeUser({ role: 'host' });
  const event = await Event.create({
    owner: host.user._id, organizers: [host.user._id], title: 'Wedding', eventType: 'wedding',
    startsAt: hoursFromNow(-5), endsAt: hoursFromNow(-1), location: { division: 'Dhaka', district: 'Dhaka' },
    guestCount: 200, budgetTotal: 100000, status: 'completed',
  });
  return { host, event };
}

async function makeCaterer() {
  const caterer = await makeUser({ role: 'provider' });
  await ProviderProfile.create({ user: caterer.user._id, businessName: 'Bhoj', category: 'caterer', division: 'Dhaka', district: 'Dhaka' });
  return caterer;
}

// An approved coordinator with an organization and an open request.
async function makeCoordinator(overrides = {}) {
  const coordinator = await makeUser({ role: 'orphanage_coordinator' });
  const org = await Organization.create({
    name: 'Home', type: 'orphanage', division: 'Dhaka', district: 'Dhaka', location: { lat: 23.75, lng: 90.37 },
    coordinators: [coordinator.user._id], approvalStatus: 'approved',
  });
  coordinator.user.organization = org._id;
  await coordinator.user.save();
  const request = await FoodRequest.create({
    organization: org._id, coordinator: coordinator.user._id, orgType: 'orphanage', title: 'Dinner',
    quantityNeeded: 100, receivingCapacity: 100, collectionCapacity: 100, division: 'Dhaka', district: 'Dhaka',
    location: org.location, availability: [{ from: hoursFromNow(-1), to: hoursFromNow(10) }], ...overrides,
  });
  return { ...coordinator, org, request };
}

const listing = (extra = {}) => ({
  foodType: 'Kacchi biryani', unit: 'portion', quantityTotal: 100,
  pickupLocation: venuePin, pickupDeadline: hoursFromNow(6), ...extra,
});

describe('posting surplus', () => {
  it('a host lists food from their event and missing information is flagged', async () => {
    const { host, event } = await makeHostWithEvent();
    const res = await api().post('/api/surplus').set(host.auth).send(listing({ eventId: String(event._id) }));
    expect(res.status).toBe(201);
    expect(res.body.listing.missingInfo).toEqual(['allergens', 'ingredients', 'preparation time', 'storage condition']);
    expect(res.body.listing.available).toBe(100);
  });

  it("a host can't list for someone else's event", async () => {
    const { event } = await makeHostWithEvent();
    const stranger = await makeUser({ role: 'host' });
    const res = await api().post('/api/surplus').set(stranger.auth).send(listing({ eventId: String(event._id) }));
    expect(res.status).toBe(404);
  });

  it('host and caterer cannot both list the same food at the same place and day (409); allowed again after cancel', async () => {
    const { host, event } = await makeHostWithEvent();
    const caterer = await makeCaterer();
    const first = await api().post('/api/surplus').set(host.auth).send(listing({ eventId: String(event._id) }));
    expect(first.status).toBe(201);

    // Caterer, same venue pin, same day, slightly different spelling/spacing:
    const dup = await api().post('/api/surplus').set(caterer.auth).send(listing({ foodType: 'kacchi  Biryani' }));
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/already listed by .* \(host\)/);

    await api().post(`/api/surplus/${first.body.listing._id}/cancel`).set(host.auth).send({ reason: 'Mistake' });
    const again = await api().post('/api/surplus').set(caterer.auth).send(listing());
    expect(again.status).toBe(201);
  });
});

describe('reservations', () => {
  async function openListing() {
    const caterer = await makeCaterer();
    const res = await api().post('/api/surplus').set(caterer.auth).send(listing());
    return { caterer, listingId: res.body.listing._id };
  }

  it('CONCURRENT reservations can never exceed the stock', async () => {
    const { listingId } = await openListing(); // 100 portions
    const coordinators = await Promise.all([makeCoordinator(), makeCoordinator(), makeCoordinator()]);

    // Three organizations ask for 40 each at the same moment (120 > 100).
    const results = await Promise.all(
      coordinators.map((c) => api().post('/api/reservations').set(c.auth).send({ listingId, requestId: String(c.request._id), quantity: 40 }))
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 409]);
    expect(results.find((r) => r.status === 409).body.error).toMatch(/Only 20 portion left/);

    const after = await SurplusListing.findById(listingId);
    expect(after.quantityReserved).toBe(80); // never 120
  });

  it('splits one listing between two organizations and becomes fully reserved', async () => {
    const { listingId } = await openListing();
    const a = await makeCoordinator();
    const b = await makeCoordinator();
    await api().post('/api/reservations').set(a.auth).send({ listingId, requestId: String(a.request._id), quantity: 60 });
    await api().post('/api/reservations').set(b.auth).send({ listingId, requestId: String(b.request._id), quantity: 40 });
    const after = await SurplusListing.findById(listingId);
    expect(after.status).toBe('fully_reserved');
    expect(await Reservation.countDocuments({ listing: listingId })).toBe(2);
  });

  it('the same Idempotency-Key creates only one reservation', async () => {
    const { listingId } = await openListing();
    const c = await makeCoordinator();
    const send = () => api().post('/api/reservations').set(c.auth).set('Idempotency-Key', 'click-123')
      .send({ listingId, requestId: String(c.request._id), quantity: 30 });
    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.reservation._id).toBe(first.body.reservation._id);
    expect((await SurplusListing.findById(listingId)).quantityReserved).toBe(30);
  });

  it('expired listings are closed to new reservations', async () => {
    const { listingId } = await openListing();
    await SurplusListing.updateOne({ _id: listingId }, { pickupDeadline: hoursFromNow(-1) });
    const c = await makeCoordinator();
    const res = await api().post('/api/reservations').set(c.auth).send({ listingId, requestId: String(c.request._id), quantity: 10 });
    expect(res.status).toBe(409);

    await api().get('/api/surplus').set(c.auth); // lazy close on read
    const closed = await SurplusListing.findById(listingId);
    expect(closed.status).toBe('closed');
    expect(closed.dedupeKey).toBeUndefined();
  });

  it('cancelling a reservation releases the quantity and re-opens the listing', async () => {
    const { listingId } = await openListing();
    const c = await makeCoordinator();
    const made = await api().post('/api/reservations').set(c.auth).send({ listingId, requestId: String(c.request._id), quantity: 100 });
    expect((await SurplusListing.findById(listingId)).status).toBe('fully_reserved');

    const cancel = await api().post(`/api/reservations/${made.body.reservation._id}/cancel`).set(c.auth).send({ reason: 'Van broke down' });
    expect(cancel.body.reservation.quantityReleased).toBe(100);
    const after = await SurplusListing.findById(listingId);
    expect(after).toMatchObject({ quantityReserved: 0, status: 'open' });
  });

  it('refuses more than the organization can receive or carry', async () => {
    const { listingId } = await openListing();
    const c = await makeCoordinator({ collectionCapacity: 25 });
    const res = await api().post('/api/reservations').set(c.auth).send({ listingId, requestId: String(c.request._id), quantity: 30 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/receive or carry \(25/);
  });
});

describe('matching', () => {
  it('ranks suitable listings, hides allergen conflicts and suggests a quantity', async () => {
    const caterer = await makeCaterer();
    await api().post('/api/surplus').set(caterer.auth).send(listing({ foodType: 'Khichuri', allergens: [], allergensDeclared: true }));
    await api().post('/api/surplus').set(caterer.auth).send(listing({ foodType: 'Firni', allergens: ['nuts', 'milk'], allergensDeclared: true }));
    const c = await makeCoordinator({ avoidAllergens: ['nuts'], collectionCapacity: 60 });

    const res = await api().get(`/api/food-requests/${c.request._id}/matches`).set(c.auth);
    expect(res.body.hiddenForAllergens).toBe(1);
    expect(res.body.matches).toHaveLength(1);
    const match = res.body.matches[0];
    expect(match.listing.foodType).toBe('Khichuri');
    expect(match.suggestedQuantity).toBe(60);
    expect(match.suggestedBecause).toBe('Limited by your collection capacity');
    expect(match.reasons).toContain('Same district (Dhaka)');
  });
});
