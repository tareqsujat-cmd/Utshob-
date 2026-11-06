import { Event } from '../../models/Event.js';
import { Rsvp } from '../../models/Rsvp.js';
import { CookingBatch } from '../../models/CookingBatch.js';
import { AuditLog } from '../../models/AuditLog.js';
import { createScenario, emptyLines, saveNewVersion } from '../../services/budget.service.js';

// A date `days` from today at `hour` o'clock Dhaka time (UTC+6), so demo dates stay in the future.
function dhakaDate(days, hour) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour - 6, 0, 0, 0);
  return d;
}
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

const FIRST = ['Ayesha', 'Rahim', 'Fatema', 'Karim', 'Sumaiya', 'Hasan', 'Mim', 'Arif', 'Tania', 'Sabbir', 'Nadia', 'Farhan', 'Lamia', 'Shakil', 'Rupa', 'Jubayer', 'Afsana', 'Tamim'];
const LAST = ['Hossain', 'Akter', 'Islam', 'Rahman', 'Chowdhury', 'Begum', 'Sarker', 'Khan', 'Ahmed'];

// Synthetic RSVPs: 43 "yes" answers totalling 156 guests, 6 "no", 5 "maybe".
function demoRsvps(eventId) {
  const yesSizes = [4, 3, 4, 2, 5, 3, 4, 3, 2, 6];
  const rows = [];
  for (let i = 0; i < 54; i++) {
    const response = i < 43 ? 'yes' : i < 49 ? 'no' : 'maybe';
    rows.push({
      event: eventId,
      guestName: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
      contact: `0171300${String(1000 + i).slice(-4)}`,
      response,
      partySize: response === 'yes' ? (i < 40 ? yesSizes[i % 10] : 4) : response === 'maybe' ? 2 : 1,
      dietaryNotes: i % 9 === 0 ? 'Vegetarian' : i % 13 === 0 ? 'Diabetic' : '',
    });
  }
  return rows;
}

// The demo scenario: "Wedding reception, 200 guests, ৳150,000, Dhaka", plus a completed earlier
// event (its surplus food is used by M1-C/M3-E) and an event of another host (permission demos).
export async function seedEvents(users, providers) {
  const host = users.host;
  const venue = providers.venue.provider;

  // ---------- Wedding reception (planned, ~5 weeks away) ----------
  const wedding = await Event.create({
    owner: host._id,
    organizers: [host._id],
    title: 'Wedding reception',
    eventType: 'wedding',
    startsAt: dhakaDate(35, 18),
    endsAt: dhakaDate(35, 23),
    location: {
      division: 'Dhaka', district: 'Dhaka', address: 'Shapla Convention Hall, Road 27, Dhanmondi',
      lat: venue.location.lat, lng: venue.location.lng,
    },
    guestCount: 200,
    budgetTotal: 150000,
    requiredServices: ['venue', 'catering', 'decoration'],
    dietary: [
      { label: 'vegetarian', guestCount: 12 },
      { label: 'diabetic', guestCount: 8 },
      { label: 'nut_allergy', guestCount: 2 },
    ],
    menu: [
      { name: 'Kacchi biryani', course: 'main', unit: 'kg', quantityPerGuest: 0.35, portionsPerUnit: 3 },
      { name: 'Chicken roast', course: 'main', unit: 'piece', quantityPerGuest: 1, portionsPerUnit: 1 },
      { name: 'Borhani', course: 'drink', unit: 'litre', quantityPerGuest: 0.25, portionsPerUnit: 4 },
      { name: 'Firni', course: 'dessert', unit: 'portion', quantityPerGuest: 1, portionsPerUnit: 1 },
    ],
    notes: 'Stage photos at 8 pm. Elderly guests seated near the entrance.',
    status: 'planned',
    invitation: {
      slug: 'wedding-reception-nusrat',
      heading: 'You are warmly invited to our wedding reception',
      message: 'Please join our families for an evening of food, music and blessings. Kindly let us know if you can come.',
      theme: { palette: 'marigold', font: 'classic', layout: 'centered' },
      rsvpDeadline: dhakaDate(28, 23),
      isPublished: true,
    },
  });

  // Budget: created empty, then a first estimate (two versions, so the history is visible).
  const budget = await createScenario({
    eventId: wedding._id, name: 'Standard', isPrimary: true, lines: emptyLines(),
    user: host, reason: 'Event created', source: 'initial',
  });
  await saveNewVersion(
    budget._id, 1,
    [
      { category: 'food', estimated: 55000, note: 'About ৳275 per guest' },
      { category: 'venue', estimated: 70000, note: 'Evening package' },
      { category: 'decoration', estimated: 15000, note: 'Stage and flowers' },
      { category: 'transport', estimated: 5000, note: 'Microbus for elders' },
      { category: 'other', estimated: 5000, note: 'Gifts, tips' },
    ],
    { user: host, reason: 'First estimate after visiting the venue', source: 'manual' }
  );

  await Rsvp.insertMany(demoRsvps(wedding._id));

  // Cooking batches. Some are already started/completed (made ahead), so a change in attendance
  // shows that only planned batches are adjusted.
  const item = (name) => wedding.menu.find((m) => m.name === name);
  const batch = (name, quantity, status, note = '') => ({
    event: wedding._id, menuItemId: item(name)._id, menuItemName: name, quantity, unit: item(name).unit,
    status, note, createdBy: host._id,
    startedAt: status !== 'planned' ? daysAgo(1) : undefined,
    completedAt: status === 'completed' ? daysAgo(1) : undefined,
  });
  await CookingBatch.insertMany([
    batch('Kacchi biryani', 35, 'planned', 'Pot 1'),
    batch('Kacchi biryani', 35, 'planned', 'Pot 2'),
    batch('Chicken roast', 120, 'started', 'Marinating'),
    batch('Chicken roast', 80, 'planned'),
    batch('Borhani', 50, 'planned'),
    batch('Firni', 100, 'completed', 'Made ahead and refrigerated'),
    batch('Firni', 100, 'planned'),
  ]);

  // A past requirement change, so the history tab has a story.
  await AuditLog.insertMany([
    { actor: host._id, actorRole: 'host', action: 'event.create', entityType: 'event', entityId: wedding._id, at: daysAgo(12) },
    {
      actor: host._id, actorRole: 'host', action: 'event.update', entityType: 'event', entityId: wedding._id, at: daysAgo(6),
      changes: [{ field: 'guestCount', from: 180, to: 200 }], reason: "Groom's side added 20 guests",
    },
  ]);

  // ---------- Engagement dinner (completed ~3 weeks ago) ----------
  const engagement = await Event.create({
    owner: host._id,
    organizers: [host._id],
    title: 'Engagement dinner',
    eventType: 'wedding',
    startsAt: dhakaDate(-19, 19),
    endsAt: dhakaDate(-19, 22),
    location: { division: 'Dhaka', district: 'Dhaka', address: 'Dhanmondi Lake Pavilion' },
    guestCount: 120,
    budgetTotal: 80000,
    requiredServices: ['venue', 'catering'],
    menu: [
      { name: 'Morog polao', course: 'main', unit: 'portion', quantityPerGuest: 1, portionsPerUnit: 1 },
      { name: 'Beef rezala', course: 'main', unit: 'kg', quantityPerGuest: 0.2, portionsPerUnit: 5 },
    ],
    status: 'completed',
  });
  const engagementBudget = await createScenario({
    eventId: engagement._id, name: 'Standard', isPrimary: true,
    lines: [
      { category: 'food', estimated: 42000 },
      { category: 'venue', estimated: 30000 },
      { category: 'other', estimated: 8000 },
    ],
    user: host, reason: 'Event created', source: 'initial',
  });

  // ---------- Another host's event (Chattogram) ----------
  const iftar = await Event.create({
    owner: users.host2._id,
    organizers: [users.host2._id],
    title: 'Office iftar gathering',
    eventType: 'religious',
    startsAt: dhakaDate(20, 17),
    endsAt: dhakaDate(20, 20),
    location: { division: 'Chattogram', district: 'Chattogram', address: 'Agrabad' },
    guestCount: 150,
    budgetTotal: 90000,
    requiredServices: ['venue', 'catering'],
    status: 'planned',
  });
  await createScenario({
    eventId: iftar._id, name: 'Standard', isPrimary: true, lines: emptyLines(),
    user: users.host2, reason: 'Event created', source: 'initial',
  });

  return { wedding, engagement, engagementBudget, iftar };
}
