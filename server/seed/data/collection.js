import { CollectionTask } from '../../models/CollectionTask.js';
import { Reservation } from '../../models/Reservation.js';
import { SurplusListing } from '../../models/SurplusListing.js';
import { FoodRequest } from '../../models/FoodRequest.js';
import { Organization } from '../../models/Organization.js';
import { ProviderProfile } from '../../models/ProviderProfile.js';
import { computeMissingInfo, makeDedupeKey } from '../../services/surplus.service.js';
import { notifyUsers } from '../../services/notify.service.js';

const hoursFromNow = (h) => new Date(Date.now() + h * 3600000);

// M2-C demo data.
//  Past: the Engagement dinner's two reservations were collected (orphanage 60 by volunteer Sadia,
//        outreach 40 by the team's own van). M3-E later confirms what happened to that food.
//  Today: outreach has two reservations from Puran Dhaka Biryani House: one with a collector
//         due in ~90 minutes (so a reminder is due), one still without a collector (live demo).
export async function seedCollection(users, surplus) {
  const [orphanageRes, outreachRes] = surplus.pastReservations;
  const pickupTime = new Date(surplus.pastListing.pickupDeadline.getTime() - 2 * 3600000);

  await CollectionTask.insertMany([
    {
      reservation: orphanageRes._id, listing: surplus.pastListing._id, organization: orphanageRes.organization,
      assignedBy: users.orphanage._id, collector: { type: 'volunteer', user: users.volunteer._id, name: users.volunteer.name, phone: users.volunteer.phone },
      scheduledAt: pickupTime, status: 'collected', quantityCollected: 60,
      history: [
        { status: 'assigned', by: users.orphanage._id, at: pickupTime },
        { status: 'en_route', by: users.volunteer._id, at: pickupTime },
        { status: 'collected', by: users.volunteer._id, at: pickupTime, note: '60 portion' },
      ],
    },
    {
      reservation: outreachRes._id, listing: surplus.pastListing._id, organization: outreachRes.organization,
      assignedBy: users.outreach._id, collector: { type: 'org_arranged', name: 'Karim (Pothshishu van)', phone: '01611000099' },
      scheduledAt: pickupTime, status: 'collected', quantityCollected: 40,
      history: [{ status: 'assigned', by: users.outreach._id, at: pickupTime }, { status: 'collected', by: users.outreach._id, at: pickupTime, note: '40 portion' }],
    },
  ]);
  await Reservation.updateOne({ _id: orphanageRes._id }, { status: 'collected', quantityCollected: 60 });
  await Reservation.updateOne({ _id: outreachRes._id }, { status: 'collected', quantityCollected: 40 });

  // ---------- Today ----------
  const outreachOrg = await Organization.findById(users.outreach.organization);
  const restaurant = await ProviderProfile.findOne({ businessName: 'Puran Dhaka Biryani House' });
  const place = { address: 'Lalbagh Road, Old Dhaka', division: 'Dhaka', district: 'Dhaka', lat: restaurant.location.lat, lng: restaurant.location.lng };
  const makeListing = async (foodType, quantity, deadlineHours) => {
    const listing = new SurplusListing({
      postedBy: restaurant.user, postedByRole: 'provider', provider: restaurant._id, foodType, unit: 'portion',
      quantityTotal: quantity, quantityReserved: quantity, status: 'fully_reserved',
      preparation: { preparedAt: hoursFromNow(-3), method: 'Restaurant kitchen' }, packaging: 'sealed_containers', storageCondition: 'hot_holding',
      pickupLocation: place, pickupDeadline: hoursFromNow(deadlineHours), ingredients: ['rice', 'chicken', 'spices'], allergens: [], allergensDeclared: true,
    });
    listing.missingInfo = computeMissingInfo(listing);
    listing.dedupeKey = makeDedupeKey(listing);
    return listing.save();
  };
  const biryani = await makeListing('Chicken biryani', 30, 8);
  const eggCurry = await makeListing('Egg curry and rice', 20, 9);

  const request = await FoodRequest.create({
    organization: outreachOrg._id, coordinator: users.outreach._id, orgType: 'outreach', title: 'Sadarghat evening distribution',
    unit: 'portion', quantityNeeded: 50, quantityMatched: 50, receivingCapacity: 60, collectionCapacity: 40, status: 'fulfilled',
    availability: [{ from: hoursFromNow(-1), to: hoursFromNow(10) }], division: 'Dhaka', district: 'Dhaka', location: outreachOrg.location,
  });
  const [withTask] = await Reservation.insertMany([
    { listing: biryani._id, request: request._id, organization: outreachOrg._id, coordinator: users.outreach._id, unit: 'portion', quantityReserved: 30, status: 'collection_assigned', history: [{ action: 'reserved', by: users.outreach._id, note: '30 portion' }] },
    { listing: eggCurry._id, request: request._id, organization: outreachOrg._id, coordinator: users.outreach._id, unit: 'portion', quantityReserved: 20, status: 'reserved', history: [{ action: 'reserved', by: users.outreach._id, note: '20 portion' }] },
  ]);
  const task = await CollectionTask.create({
    reservation: withTask._id, listing: biryani._id, organization: outreachOrg._id, assignedBy: users.outreach._id,
    collector: { type: 'volunteer', user: users.volunteer._id, name: users.volunteer.name, phone: users.volunteer.phone },
    scheduledAt: hoursFromNow(1.5), activeKey: String(withTask._id),
    history: [{ status: 'assigned', by: users.outreach._id, note: `Collector: ${users.volunteer.name}` }],
  });
  await notifyUsers([users.volunteer._id], {
    type: 'task.assigned', title: 'Pickup assigned: 30 portion Chicken biryani',
    body: 'Collect from Lalbagh Road, Old Dhaka in about 90 minutes.', link: '/tasks', relatedTask: task._id,
  });
}
