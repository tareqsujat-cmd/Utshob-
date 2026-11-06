import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { startTestDB, stopTestDB, resetTestDB, makeUser, api } from './helpers.js';
import { ProviderProfile } from '../models/ProviderProfile.js';
import { Credential } from '../models/Credential.js';
import { File } from '../models/File.js';
import { clearGeoCache } from '../services/nominatim.service.js';

beforeAll(startTestDB);
afterAll(stopTestDB);
beforeEach(async () => {
  await resetTestDB();
  clearGeoCache();
});
afterEach(() => vi.restoreAllMocks());

const nextYear = new Date(Date.now() + 365 * 86400000);
const dhanmondi = { division: 'Dhaka', district: 'Dhaka', lat: 23.7461, lng: 90.3742 };

// A bookable provider (approved account + valid required documents).
async function provider(fields, { bookable = true } = {}) {
  const owner = await makeUser({ role: 'provider', approvalStatus: bookable ? 'approved' : 'pending' });
  const p = await ProviderProfile.create({
    user: owner.user._id, division: 'Dhaka', district: 'Dhaka', serviceAreas: [{ division: 'Dhaka' }],
    location: { lat: 23.75, lng: 90.37 }, ...fields,
  });
  const types = p.category === 'venue' ? ['trade_licence', 'fire_safety'] : ['trade_licence', 'food_safety'];
  for (const type of types) {
    const file = await File.create({ owner: owner.user._id, filename: 'x.pdf', mimeType: 'application/pdf', size: 1, data: Buffer.from('x') });
    await Credential.create({ provider: p._id, type, number: 'N-1', expiresAt: nextYear, file: file._id, status: 'approved' });
  }
  return p;
}

const venuePkg = (price, min = 50, max = 400) => [{ name: 'Evening', pricingType: 'flat', price, minGuests: min, maxGuests: max }];
const catererPkg = (perGuest) => [{ name: 'Buffet', pricingType: 'per_guest', price: perGuest, minGuests: 20, maxGuests: 800 }];

async function search(body) {
  const host = await makeUser({ role: 'host' });
  return api().post('/api/providers/search').set(host.auth).send({ location: dhanmondi, guestCount: 200, ...body });
}

describe('Nominatim location search', () => {
  it('maps OSM names to our divisions/districts (e.g. Chittagong -> Chattogram) and caches', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
      { display_name: 'Agrabad, Chittagong', lat: '22.3256', lon: '91.8123', address: { state: 'Chittagong Division', state_district: 'Chittagong District' } },
    ])));
    const host = await makeUser({ role: 'host' });
    const res = await api().get('/api/geo/search?q=agrabad').set(host.auth);
    expect(res.body.places[0]).toMatchObject({ division: 'Chattogram', district: 'Chattogram', lat: 22.3256, lng: 91.8123 });

    await api().get('/api/geo/search?q=Agrabad').set(host.auth); // same query, different case
    expect(fetchSpy).toHaveBeenCalledTimes(1); // second answer came from the cache
    expect(fetchSpy.mock.calls[0][1].headers['User-Agent']).toMatch(/UTSHOB/); // usage policy
  });

  it('when Nominatim is down: 502 with the manual-address fallback message', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
    const host = await makeUser({ role: 'host' });
    const res = await api().get('/api/geo/search?q=mirpur').set(host.auth);
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Enter the address manually/);
  });
});

describe('provider matching', () => {
  it('only bookable providers serving the area; explains why each matches', async () => {
    await provider({ businessName: 'Good Hall', category: 'venue', capacity: { min: 50, max: 400 }, packages: venuePkg(60000) });
    await provider({ businessName: 'Pending Hall', category: 'venue', capacity: { min: 50, max: 400 }, packages: venuePkg(50000) }, { bookable: false });
    await provider({ businessName: 'Sylhet Hall', category: 'venue', serviceAreas: [{ division: 'Sylhet' }], capacity: { min: 50, max: 400 }, packages: venuePkg(40000) });

    const res = await search({ categories: ['venue'], budgets: { venue: 70000 } });
    const venues = res.body.results.venue;
    // Pending accounts never enter the search; approved-but-elsewhere providers are counted as excluded.
    expect(venues.results.map((r) => r.provider.businessName)).toEqual(['Good Hall']);
    expect(venues.excluded).toMatchObject({ notServingArea: 1 });
    expect(venues.note).toMatch(/Only 1 venue option/);
    expect(venues.results[0].reasons.join(' ')).toMatch(/within your ৳70,000 budget/);
    expect(venues.results[0].limitedHistory).toBe(true);
  });

  it('flags capacity conflicts and over-budget options instead of hiding them, and lists clean ones first', async () => {
    await provider({ businessName: 'Small Hall', category: 'venue', capacity: { min: 20, max: 120 }, packages: venuePkg(30000, 20, 120) });
    await provider({ businessName: 'Pricey Hall', category: 'venue', capacity: { min: 50, max: 600 }, packages: venuePkg(150000) });
    await provider({ businessName: 'Right Hall', category: 'venue', capacity: { min: 50, max: 400 }, packages: venuePkg(65000) });

    const { results } = (await search({ categories: ['venue'], budgets: { venue: 70000 } })).body;
    const names = results.venue.results.map((r) => r.provider.businessName);
    expect(names[0]).toBe('Right Hall');
    const small = results.venue.results.find((r) => r.provider.businessName === 'Small Hall');
    expect(small.flags.join(' ')).toMatch(/Capacity conflict: holds up to 120, you expect 200/);
    const pricey = results.venue.results.find((r) => r.provider.businessName === 'Pricey Hall');
    expect(pricey.flags.join(' ')).toMatch(/Over your budget by ৳80,000/);
  });

  it('flags caterers when the chosen venue does not allow outside catering', async () => {
    const venue = await provider({ businessName: 'Strict Ballroom', category: 'venue', allowsOutsideCatering: false, capacity: { min: 50, max: 600 }, packages: venuePkg(100000) });
    await provider({ businessName: 'Bhoj', category: 'caterer', capacity: { min: 20, max: 800 }, packages: catererPkg(250) });

    const { results } = (await search({ categories: ['caterer'], venueId: String(venue._id) })).body;
    expect(results.caterer.results[0].flags).toContain('Strict Ballroom does not allow outside catering');
  });

  it('respects required services, blocked dates and the 10-per-category limit', async () => {
    const date = new Date(Date.now() + 30 * 86400000);
    await provider({ businessName: 'No Halal', category: 'caterer', tags: [], packages: catererPkg(200) });
    await provider({ businessName: 'Busy', category: 'caterer', tags: ['halal'], blockedDates: [{ date }], packages: catererPkg(200) });
    for (let i = 0; i < 11; i++) await provider({ businessName: `Halal ${i}`, category: 'caterer', tags: ['halal'], packages: catererPkg(200 + i) });

    const { results } = (await search({ categories: ['caterer'], services: ['halal'], date: date.toISOString() })).body;
    expect(results.caterer.results).toHaveLength(10);
    expect(results.caterer.totalMatched).toBe(11);
    expect(results.caterer.excluded).toMatchObject({ missingServices: 1, unavailableOnDate: 1 });
  });
});
