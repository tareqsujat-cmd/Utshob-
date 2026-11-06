import { SurplusListing } from '../../models/SurplusListing.js';
import { FoodRequest } from '../../models/FoodRequest.js';
import { Reservation } from '../../models/Reservation.js';
import { Organization } from '../../models/Organization.js';
import { computeMissingInfo, makeDedupeKey } from '../../services/surplus.service.js';

const hoursFromNow = (h) => new Date(Date.now() + h * 3600000);

// Build and save a listing with missingInfo and dedupeKey computed exactly like the API does.
async function addListing(fields, { open = true } = {}) {
  const listing = new SurplusListing(fields);
  listing.missingInfo = computeMissingInfo(listing);
  if (open) listing.dedupeKey = makeDedupeKey(listing);
  await listing.save();
  return listing;
}

// M1-C demo data:
//  - the completed Engagement dinner's surplus (100 portions, shared 60 orphanage / 40 outreach)
//  - open listings around Dhaka today (one with missing info, one with nuts, one already expired)
//  - one open request per coordinator
export async function seedSurplus(users, providers, events) {
  const orphanageOrg = await Organization.findById(users.orphanage.organization);
  const outreachOrg = await Organization.findById(users.outreach.organization);

  // ---------- Past: Engagement dinner surplus ----------
  const engagementEnd = events.engagement.endsAt;
  const past = await addListing(
    {
      postedBy: users.host._id, postedByRole: 'host', event: events.engagement._id,
      foodType: 'Morog polao', description: 'Untouched trays from the buffet', unit: 'portion',
      quantityTotal: 100, quantityReserved: 100,
      preparation: { preparedAt: new Date(engagementEnd.getTime() - 5 * 3600000), method: 'Cooked by the caterer' },
      packaging: 'foil_trays', storageCondition: 'hot_holding',
      pickupLocation: { address: 'Dhanmondi Lake Pavilion', division: 'Dhaka', district: 'Dhaka', lat: 23.7465, lng: 90.376 },
      pickupDeadline: new Date(engagementEnd.getTime() + 3 * 3600000),
      ingredients: ['rice', 'chicken', 'ghee', 'spices'], allergens: ['milk'], allergensDeclared: true,
      status: 'closed',
    },
    { open: false }
  );
  const pastRequests = await FoodRequest.insertMany([
    {
      organization: orphanageOrg._id, coordinator: users.orphanage._id, orgType: 'orphanage', title: 'Dinner for the children',
      unit: 'portion', quantityNeeded: 60, quantityMatched: 60, receivingCapacity: 80, collectionCapacity: 60,
      division: 'Dhaka', district: 'Dhaka', location: orphanageOrg.location, status: 'fulfilled',
    },
    {
      organization: outreachOrg._id, coordinator: users.outreach._id, orgType: 'outreach', title: 'Kamalapur night distribution',
      unit: 'portion', quantityNeeded: 40, quantityMatched: 40, receivingCapacity: 50, collectionCapacity: 40,
      division: 'Dhaka', district: 'Dhaka', location: outreachOrg.location, status: 'fulfilled',
    },
  ]);
  const pastReservations = await Reservation.insertMany([
    {
      listing: past._id, request: pastRequests[0]._id, organization: orphanageOrg._id, coordinator: users.orphanage._id,
      unit: 'portion', quantityReserved: 60, history: [{ action: 'reserved', by: users.orphanage._id, note: '60 portion' }],
    },
    {
      listing: past._id, request: pastRequests[1]._id, organization: outreachOrg._id, coordinator: users.outreach._id,
      unit: 'portion', quantityReserved: 40, history: [{ action: 'reserved', by: users.outreach._id, note: '40 portion' }],
    },
  ]);

  // ---------- Today: open listings ----------
  const fromProvider = (key) => ({ postedBy: key.user._id, postedByRole: 'provider', provider: key.provider._id });
  const at = (provider, address) => ({
    address, division: provider.division, district: provider.district,
    lat: provider.location.lat, lng: provider.location.lng,
  });

  const khichuri = await addListing({
    ...fromProvider(providers.caterer),
    foodType: 'Vegetable khichuri', description: 'Extra pots from a corporate lunch', unit: 'portion', quantityTotal: 80,
    preparation: { preparedAt: hoursFromNow(-2), method: 'Cooked in large pots' }, packaging: 'foil_trays', storageCondition: 'hot_holding',
    pickupLocation: at(providers.caterer.provider, 'Block C, Mohammadpur'), pickupDeadline: hoursFromNow(20),
    ingredients: ['rice', 'lentils', 'potato', 'mixed vegetables', 'mustard oil'], allergens: [], allergensDeclared: true,
  });
  await addListing({
    postedBy: providers.venue.user._id, postedByRole: 'provider', provider: providers.venue.provider._id,
    foodType: 'Firni cups', description: 'Dessert left after a reception', unit: 'portion', quantityTotal: 40,
    preparation: { preparedAt: hoursFromNow(-6), method: 'Set in cups' }, packaging: 'sealed_containers', storageCondition: 'refrigerated',
    pickupLocation: at(providers.venue.provider, 'Road 27, Dhanmondi'), pickupDeadline: hoursFromNow(12),
    ingredients: ['milk', 'rice flour', 'sugar', 'pistachio', 'almond'], allergens: ['milk', 'nuts'], allergensDeclared: true,
  });
  // Missing information on purpose: no allergens declared, no ingredients, no preparation time.
  await addListing({
    postedBy: providers.caterer.user._id, postedByRole: 'provider', provider: providers.caterer.provider._id,
    foodType: 'Dal and rice', unit: 'portion', quantityTotal: 50, packaging: 'bulk_pots',
    pickupLocation: { address: 'Mohammadpur Town Hall', division: 'Dhaka', district: 'Dhaka', lat: 23.7612, lng: 90.3605 },
    pickupDeadline: hoursFromNow(10),
  });
  // Already past its deadline but still "open": the first read closes it (lazy expiry).
  await addListing({
    ...fromProvider(providers.caterer),
    foodType: 'Chicken roast', unit: 'piece', quantityTotal: 60,
    preparation: { preparedAt: hoursFromNow(-9), method: 'Roasted' }, storageCondition: 'room_temperature',
    pickupLocation: at(providers.caterer.provider, 'Block C, Mohammadpur'), pickupDeadline: hoursFromNow(-2),
    ingredients: ['chicken', 'yogurt', 'spices'], allergens: ['milk'], allergensDeclared: true,
  });

  // ---------- Today: open requests ----------
  const today = [{ from: hoursFromNow(-1), to: hoursFromNow(12) }, { from: hoursFromNow(22), to: hoursFromNow(30) }];
  await FoodRequest.insertMany([
    {
      organization: orphanageOrg._id, coordinator: users.orphanage._id, orgType: 'orphanage', title: 'Dinner for 80 children',
      notes: 'Two children have nut allergies.', unit: 'portion', quantityNeeded: 80, receivingCapacity: 80, collectionCapacity: 60,
      availability: today, avoidAllergens: ['nuts'], division: 'Dhaka', district: 'Dhaka', location: orphanageOrg.location,
    },
    {
      organization: outreachOrg._id, coordinator: users.outreach._id, orgType: 'outreach', title: 'Night distribution at Kamalapur',
      unit: 'portion', quantityNeeded: 50, receivingCapacity: 50, collectionCapacity: 40,
      availability: [{ from: hoursFromNow(-1), to: hoursFromNow(14) }], division: 'Dhaka', district: 'Dhaka', location: outreachOrg.location,
    },
  ]);

  return { pastListing: past, pastReservations, khichuri };
}
