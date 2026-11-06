import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDB, stopTestDB, resetTestDB, makeUser, api } from './helpers.js';
import { Event } from '../models/Event.js';
import { CookingBatch } from '../models/CookingBatch.js';
import { Notification } from '../models/Notification.js';
import { AuditLog } from '../models/AuditLog.js';
import { Rsvp } from '../models/Rsvp.js';
import { suggestAdjustments } from '../services/foodplan.service.js';

beforeAll(startTestDB);
afterAll(stopTestDB);
beforeEach(resetTestDB);

const inDays = (n, hour = 18) => {
  const d = new Date(Date.now() + n * 86400000);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const wedding = {
  title: 'Wedding reception',
  eventType: 'wedding',
  startsAt: inDays(30, 18),
  endsAt: inDays(30, 23),
  location: { division: 'Dhaka', district: 'Dhaka', address: 'Dhanmondi' },
  guestCount: 200,
  budgetTotal: 150000,
  requiredServices: ['venue', 'catering'],
};

async function createEvent(host, body = wedding) {
  const res = await api().post('/api/events').set(host.auth).send(body);
  expect(res.status).toBe(201);
  return res.body.event;
}

describe('events: create, limits, permissions', () => {
  it('Starter plan allows 1 active event (backend enforced, 402 with upgrade hint)', async () => {
    const host = await makeUser({ role: 'host' });
    await createEvent(host);
    const second = await api().post('/api/events').set(host.auth).send({ ...wedding, title: 'Second' });
    expect(second.status).toBe(402);
    expect(second.body.upgradeTo).toBe('plus');
  });

  it('other hosts cannot see or edit my event (404)', async () => {
    const owner = await makeUser({ role: 'host' });
    const stranger = await makeUser({ role: 'host' });
    const event = await createEvent(owner);
    expect((await api().get(`/api/events/${event._id}`).set(stranger.auth)).status).toBe(404);
    expect((await api().patch(`/api/events/${event._id}`).set(stranger.auth).send(wedding)).status).toBe(404);
  });

  it('a requirement change needs a reason and is recorded in the history', async () => {
    const host = await makeUser({ role: 'host' });
    const event = await createEvent(host);
    const { startsAt, endsAt, ...editable } = wedding;

    const noReason = await api().patch(`/api/events/${event._id}`).set(host.auth).send({ ...editable, guestCount: 180 });
    expect(noReason.status).toBe(400);
    expect(noReason.body.details[0].field).toBe('reason');

    const ok = await api().patch(`/api/events/${event._id}`).set(host.auth).send({ ...editable, guestCount: 180, reason: 'Fewer relatives travelling' });
    expect(ok.status).toBe(200);
    expect(ok.body.foodPlanNeedsReview).toBe(true);

    const history = await api().get(`/api/events/${event._id}/history`).set(host.auth);
    const update = history.body.logs.find((l) => l.action === 'event.update');
    expect(update.changes[0]).toMatchObject({ field: 'guestCount', from: 200, to: 180 });
    expect(update.reason).toBe('Fewer relatives travelling');
  });

  it('cancel notifies co-organizers, keeps the record, and makes it read-only', async () => {
    const host = await makeUser({ role: 'host' });
    const helper = await makeUser({ role: 'host' });
    const event = await createEvent(host);
    await Event.updateOne({ _id: event._id }, { $push: { organizers: helper.user._id } });

    const res = await api().post(`/api/events/${event._id}/cancel`).set(host.auth).send({ reason: 'Family emergency' });
    expect(res.status).toBe(200);
    expect(await Notification.countDocuments({ user: helper.user._id, type: 'event.cancelled' })).toBe(1);
    expect(await Event.countDocuments({ _id: event._id })).toBe(1); // not deleted

    const edit = await api().patch(`/api/events/${event._id}`).set(host.auth).send({ ...wedding, reason: 'x' });
    expect(edit.status).toBe(409);
  });

  it('copy creates a draft with the same requirements (and counts against the limit)', async () => {
    const host = await makeUser({ role: 'host' });
    const event = await createEvent(host);
    await api().post(`/api/events/${event._id}/cancel`).set(host.auth).send({ reason: 'Moved to next year' });

    const copy = await api().post(`/api/events/${event._id}/copy`).set(host.auth).send({ startsAt: inDays(60), endsAt: inDays(60, 23) });
    expect(copy.status).toBe(201);
    expect(copy.body.event).toMatchObject({ status: 'draft', guestCount: 200, budgetTotal: 150000 });
    expect(String(copy.body.event.copiedFrom)).toBe(String(event._id));
  });
});

describe('budget', () => {
  it('saves versions and rejects an edit based on an old version (409)', async () => {
    const host = await makeUser({ role: 'host' });
    const event = await createEvent(host);
    const { budgets } = (await api().get(`/api/events/${event._id}/budgets`).set(host.auth)).body;
    const budget = budgets[0];
    const lines = [{ category: 'food', estimated: 60000 }, { category: 'venue', estimated: 70000 }];

    const first = await api().patch(`/api/budgets/${budget._id}`).set(host.auth).send({ lines, reason: 'First estimate', version: 1 });
    expect(first.body.budget.version).toBe(2);
    expect(first.body.budget.versions).toHaveLength(2);

    const stale = await api().patch(`/api/budgets/${budget._id}`).set(host.auth).send({ lines, reason: 'Old screen', version: 1 });
    expect(stale.status).toBe(409);
  });

  it('Starter allows only 1 budget scenario', async () => {
    const host = await makeUser({ role: 'host' });
    const event = await createEvent(host);
    const res = await api().post(`/api/events/${event._id}/budgets`).set(host.auth).send({ name: 'Lean' });
    expect(res.status).toBe(402);
  });

  it('summary warns about over budget and missing charges', async () => {
    const host = await makeUser({ role: 'host' });
    const event = await createEvent(host); // needs venue + catering, budget 150,000
    const { budgets } = (await api().get(`/api/events/${event._id}/budgets`).set(host.auth)).body;
    await api().patch(`/api/budgets/${budgets[0]._id}`).set(host.auth)
      .send({ lines: [{ category: 'venue', estimated: 160000 }], reason: 'Venue quote', version: 1 });

    const summary = (await api().get(`/api/events/${event._id}/budget-summary`).set(host.auth)).body;
    const codes = summary.alerts.map((a) => a.code);
    expect(codes).toContain('over_budget'); // 160,000 > 150,000
    expect(codes).toContain('missing_charge'); // catering needed, food line is 0
    expect(summary.remaining).toBe(-10000);
  });
});

describe('invitation and RSVP', () => {
  it('one answer per phone number: answering again updates it', async () => {
    const host = await makeUser({ role: 'host' });
    const event = await createEvent(host);
    const inv = await api().put(`/api/events/${event._id}/invitation`).set(host.auth)
      .send({ heading: 'Join us', theme: { palette: 'marigold', font: 'classic', layout: 'centered' }, isPublished: true });
    const slug = inv.body.invitation.slug;

    const first = await api().post(`/api/public/invitations/${slug}/rsvp`).send({ guestName: 'Rafi', phone: '+880 1711-222333', response: 'yes', partySize: 3 });
    expect(first.status).toBe(201);
    const again = await api().post(`/api/public/invitations/${slug}/rsvp`).send({ guestName: 'Rafi', phone: '01711222333', response: 'yes', partySize: 2 });
    expect(again.status).toBe(200);
    expect(again.body.updated).toBe(true);

    expect(await Rsvp.countDocuments({ event: event._id })).toBe(1);
    const list = await api().get(`/api/events/${event._id}/rsvps`).set(host.auth);
    expect(list.body.totals.confirmedGuests).toBe(2);
  });

  it('unpublished invitations are not visible', async () => {
    const host = await makeUser({ role: 'host' });
    const event = await createEvent(host);
    const inv = await api().put(`/api/events/${event._id}/invitation`).set(host.auth)
      .send({ theme: { palette: 'teal', font: 'modern', layout: 'banner' }, isPublished: false });
    expect((await api().get(`/api/public/invitations/${inv.body.invitation.slug}`)).status).toBe(404);
  });
});

describe('food plan', () => {
  it('suggestions only touch planned batches; started/completed quantities are preserved', () => {
    const menu = [{ _id: 'm1', name: 'Firni', unit: 'portion', quantityPerGuest: 1, portionsPerUnit: 1 }];
    const batches = [
      { _id: 'b1', menuItemId: 'm1', quantity: 100, status: 'completed' },
      { _id: 'b2', menuItemId: 'm1', quantity: 100, status: 'planned' },
    ];
    const result = suggestAdjustments(menu, batches, 156);
    expect(result.adjustments).toEqual([
      expect.objectContaining({ type: 'update', batchId: 'b2', from: 100, to: 56 }),
    ]);

    // Fewer guests than already cooked: planned batch cancelled, the rest is a note (never touched).
    const tooFew = suggestAdjustments(menu, batches, 60);
    expect(tooFew.adjustments).toEqual([expect.objectContaining({ type: 'cancel', batchId: 'b2' })]);
    expect(tooFew.notes[0]).toMatch(/40 portion more than needed is already started or completed/);
  });

  it('apply skips a batch that started cooking after the suggestion was made', async () => {
    const host = await makeUser({ role: 'host' });
    const event = await createEvent(host);
    const menuRes = await api().put(`/api/events/${event._id}/menu`).set(host.auth)
      .send({ menu: [{ name: 'Kacchi biryani', unit: 'kg', quantityPerGuest: 0.35, portionsPerUnit: 3 }] });
    const itemId = menuRes.body.menu[0]._id;
    const batch = (await api().post(`/api/events/${event._id}/batches`).set(host.auth).send({ menuItemId: itemId, quantity: 70 })).body.batch;
    expect(batch.unit).toBe('kg'); // unit always taken from the dish

    const suggestion = (await api().post(`/api/events/${event._id}/food-plan/suggest`).set(host.auth).send({ attendance: 150 })).body;
    expect(suggestion.adjustments[0]).toMatchObject({ type: 'update', from: 70, to: 52.5 });

    // Meanwhile the kitchen starts cooking that batch.
    await api().patch(`/api/batches/${batch._id}/status`).set(host.auth).send({ status: 'started' });

    const applied = await api().post(`/api/events/${event._id}/food-plan/apply`).set(host.auth)
      .send({ attendance: 150, adjustments: suggestion.adjustments });
    expect(applied.body.applied).toHaveLength(0);
    expect(applied.body.skipped).toHaveLength(1);
    expect((await CookingBatch.findById(batch._id)).quantity).toBe(70); // untouched
    expect(await AuditLog.countDocuments({ action: 'event.food_plan_adjust' })).toBe(1);
  });

  it('rejects impossible batch status changes', async () => {
    const host = await makeUser({ role: 'host' });
    const event = await createEvent(host);
    const menu = await api().put(`/api/events/${event._id}/menu`).set(host.auth).send({ menu: [{ name: 'Borhani', unit: 'litre', quantityPerGuest: 0.25 }] });
    const batch = (await api().post(`/api/events/${event._id}/batches`).set(host.auth).send({ menuItemId: menu.body.menu[0]._id, quantity: 50 })).body.batch;
    const res = await api().patch(`/api/batches/${batch._id}/status`).set(host.auth).send({ status: 'completed' });
    expect(res.status).toBe(409); // planned -> completed is not allowed (must start first)
  });
});
