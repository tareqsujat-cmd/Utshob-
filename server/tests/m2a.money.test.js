import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDB, stopTestDB, resetTestDB, makeUser, api } from './helpers.js';
import { Event } from '../models/Event.js';
import { Expense } from '../models/Expense.js';
import { createScenario } from '../services/budget.service.js';

beforeAll(startTestDB);
afterAll(stopTestDB);
beforeEach(resetTestDB);

async function setup() {
  const host = await makeUser({ role: 'host' });
  const event = await Event.create({
    owner: host.user._id, organizers: [host.user._id], title: 'Wedding', eventType: 'wedding',
    startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000),
    location: { division: 'Dhaka', district: 'Dhaka' }, guestCount: 100, budgetTotal: 100000,
    costSplit: { method: 'equal', groups: [{ name: "Bride's family" }, { name: "Groom's family" }] },
  });
  await createScenario({ eventId: event._id, name: 'Standard', isPrimary: true, lines: [{ category: 'venue', estimated: 30000 }], user: host.user, reason: 'x', source: 'initial' });
  return { host, event };
}
const today = new Date().toISOString().slice(0, 10);

describe('expenses', () => {
  it('records, voids (never deletes) and feeds the budget summary', async () => {
    const { host, event } = await setup();
    const add = (body) => api().post(`/api/events/${event._id}/expenses`).set(host.auth).send({ date: today, ...body });
    const venue = await add({ category: 'venue', description: 'Hall advance', amount: 35000 });
    await add({ category: 'food', description: 'Mistake', amount: 999 });
    const mistake = (await Expense.findOne({ description: 'Mistake' }))._id;
    await api().post(`/api/expenses/${mistake}/void`).set(host.auth).send({ reason: 'Entered twice' });

    expect(venue.status).toBe(201);
    expect(await Expense.countDocuments({ event: event._id })).toBe(2); // void one still stored
    const list = await api().get(`/api/events/${event._id}/expenses`).set(host.auth);
    expect(list.body.total).toBe(35000);

    const summary = await api().get(`/api/events/${event._id}/budget-summary`).set(host.auth);
    expect(summary.body.totals.spent).toBe(35000);
    expect(summary.body.alerts.map((a) => a.code)).toContain('spent_over_estimate'); // 35,000 > 30,000
  });

  it("other hosts can't add expenses to my event", async () => {
    const { event } = await setup();
    const stranger = await makeUser({ role: 'host' });
    const res = await api().post(`/api/events/${event._id}/expenses`).set(stranger.auth).send({ category: 'food', description: 'x x', amount: 10, date: today });
    expect(res.status).toBe(404);
  });
});

describe('cost split', () => {
  it('equal split: share, paid directly, contributed and outstanding per group', async () => {
    const { host, event } = await setup();
    await api().post(`/api/events/${event._id}/expenses`).set(host.auth).send({ category: 'venue', description: 'Hall', amount: 60000, date: today, paidByGroup: "Bride's family" });
    await api().post(`/api/events/${event._id}/contributions`).set(host.auth).send({ type: 'cash', contributorName: 'Groom father', group: "Groom's family", amountPledged: 20000 })
      .then((r) => api().post(`/api/contributions/${r.body.contribution._id}/receive`).set(host.auth).send({ amount: 10000 }));

    const { body } = await api().get(`/api/events/${event._id}/split-summary`).set(host.auth);
    const [bride, groom] = body.groups;
    expect(body.total).toBe(60000);
    expect(bride).toMatchObject({ share: 30000, paidDirectly: 60000, outstanding: -30000 }); // paid more than its share
    expect(groom).toMatchObject({ share: 30000, contributed: 10000, outstanding: 20000 }); // only RECEIVED money counts
  });

  it('percentage splits need the Plus plan (402) and must add up to 100 (400)', async () => {
    const { host, event } = await setup();
    const bad = await api().put(`/api/events/${event._id}/split`).set(host.auth).send({ method: 'percentage', groups: [{ name: 'A', percentage: 60 }, { name: 'B', percentage: 30 }] });
    expect(bad.status).toBe(400);
    const gated = await api().put(`/api/events/${event._id}/split`).set(host.auth).send({ method: 'percentage', groups: [{ name: 'A', percentage: 60 }, { name: 'B', percentage: 40 }] });
    expect(gated.status).toBe(402);
    expect(gated.body.upgradeTo).toBe('plus');
  });
});

describe('contributions', () => {
  it('keeps pledged and received apart and refuses receiving more than pledged', async () => {
    const { host, event } = await setup();
    const { body } = await api().post(`/api/events/${event._id}/contributions`).set(host.auth).send({ type: 'cash', contributorName: 'Uncle Rafiq', amountPledged: 5000 });
    const id = body.contribution._id;

    const part = await api().post(`/api/contributions/${id}/receive`).set(host.auth).send({ amount: 3000 });
    expect(part.body.contribution).toMatchObject({ amountPledged: 5000, amountReceived: 3000, status: 'partially_received' });
    const tooMuch = await api().post(`/api/contributions/${id}/receive`).set(host.auth).send({ amount: 2500 });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error).toMatch(/৳2000/);

    const cancel = await api().post(`/api/contributions/${id}/cancel`).set(host.auth).send({ reason: 'Changed mind' });
    expect(cancel.status).toBe(409); // money was received: can't cancel
  });

  it('in-kind goods: received quantity tracked separately from the pledged quantity', async () => {
    const { host, event } = await setup();
    const { body } = await api().post(`/api/events/${event._id}/contributions`).set(host.auth)
      .send({ type: 'in_kind', contributorName: 'Aunt Shirin', inKind: { description: 'Basmati rice', quantity: 50, unit: 'kg', estimatedValue: 6000 } });
    const res = await api().post(`/api/contributions/${body.contribution._id}/receive`).set(host.auth).send({ quantity: 30 });
    expect(res.body.contribution.inKind).toMatchObject({ quantity: 50, receivedQuantity: 30 });
    expect(res.body.contribution.status).toBe('partially_received');
  });

  it('sponsorship offers need the Plus plan', async () => {
    const { host, event } = await setup();
    const res = await api().post(`/api/events/${event._id}/contributions`).set(host.auth)
      .send({ type: 'sponsorship', contributorName: 'Pran Foods', amountPledged: 20000, sponsorship: { sponsorName: 'Pran Foods', offer: 'Drinks', benefitsPromised: 'Logo' } });
    expect(res.status).toBe(402);
  });
});
