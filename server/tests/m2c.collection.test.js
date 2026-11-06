import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { startTestDB, stopTestDB, resetTestDB, makeUser, api } from './helpers.js';
import { env } from '../config/env.js';
import { Organization } from '../models/Organization.js';
import { SurplusListing } from '../models/SurplusListing.js';
import { FoodRequest } from '../models/FoodRequest.js';
import { Reservation } from '../models/Reservation.js';
import { CollectionTask } from '../models/CollectionTask.js';
import { Notification } from '../models/Notification.js';
import { setSetting } from '../services/settings.service.js';

beforeAll(startTestDB);
afterAll(stopTestDB);
beforeEach(resetTestDB);
afterEach(() => {
  vi.restoreAllMocks();
  env.telegram.botToken = '';
});

const hours = (h) => new Date(Date.now() + h * 3600000);

// A coordinator with a 50-portion reservation, a poster, and a volunteer (optionally on Telegram).
async function setup({ volunteerOnTelegram = false } = {}) {
  const poster = await makeUser({ role: 'provider' });
  const coordinator = await makeUser({ role: 'outreach_coordinator' });
  const org = await Organization.create({ name: 'Team', type: 'outreach', division: 'Dhaka', district: 'Dhaka', coordinators: [coordinator.user._id], approvalStatus: 'approved' });
  coordinator.user.organization = org._id;
  await coordinator.user.save();
  const volunteer = await makeUser({ role: 'volunteer', ...(volunteerOnTelegram && { telegram: { chatId: '555', linkedAt: new Date() } }) });
  const listing = await SurplusListing.create({
    postedBy: poster.user._id, postedByRole: 'provider', foodType: 'Khichuri', unit: 'portion', quantityTotal: 80, quantityReserved: 50,
    pickupLocation: { division: 'Dhaka', district: 'Dhaka', address: 'Mohammadpur' }, pickupDeadline: hours(6), status: 'open',
  });
  const request = await FoodRequest.create({ organization: org._id, coordinator: coordinator.user._id, orgType: 'outreach', title: 'Night', quantityNeeded: 50, quantityMatched: 50, receivingCapacity: 50, collectionCapacity: 50, division: 'Dhaka', district: 'Dhaka' });
  const reservation = await Reservation.create({ listing: listing._id, request: request._id, organization: org._id, coordinator: coordinator.user._id, unit: 'portion', quantityReserved: 50 });
  return { poster, coordinator, volunteer, listing, reservation };
}

const assign = (ctx, extra = {}, key) => {
  const req = api().post(`/api/reservations/${ctx.reservation._id}/tasks`).set(ctx.coordinator.auth);
  if (key) req.set('Idempotency-Key', key);
  return req.send({ collectorType: 'volunteer', volunteerId: String(ctx.volunteer.user._id), scheduledAt: hours(1), ...extra });
};
const setStatus = (ctx, taskId, body, who = ctx.coordinator) => api().patch(`/api/tasks/${taskId}/status`).set(who.auth).send(body);

// A fake Telegram that accepts every message (or fails, if `ok` is false).
function fakeTelegram(ok = true) {
  env.telegram.botToken = 'test-token';
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(ok ? { ok: true, result: {} } : { ok: false, description: 'Bad Gateway' })));
}

describe('assigning collectors', () => {
  it('only one active task per reservation, even when Assign is clicked twice at once', async () => {
    const ctx = await setup();
    const [a, b] = await Promise.all([assign(ctx), assign(ctx)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await CollectionTask.countDocuments()).toBe(1);
    expect((await Reservation.findById(ctx.reservation._id)).status).toBe('collection_assigned');
  });

  it('a retried request with the same Idempotency-Key returns the same task', async () => {
    const ctx = await setup();
    const first = await assign(ctx, {}, 'assign-1');
    const again = await assign(ctx, {}, 'assign-1');
    expect(again.status).toBe(200);
    expect(again.body.task._id).toBe(first.body.task._id);
  });

  it('the volunteer sees only their own tasks; other organizations get 404', async () => {
    const ctx = await setup();
    const { body } = await assign(ctx);
    expect((await api().get('/api/tasks').set(ctx.volunteer.auth)).body.tasks).toHaveLength(1);
    const other = await makeUser({ role: 'volunteer' });
    expect((await api().get('/api/tasks').set(other.auth)).body.tasks).toHaveLength(0);
    expect((await setStatus(ctx, body.task._id, { status: 'en_route' }, other)).status).toBe(404);
  });
});

describe('tracking pickups', () => {
  it('partial collection records collected and shortage separately and frees the reservation lock', async () => {
    const ctx = await setup();
    const { body } = await assign(ctx);
    await setStatus(ctx, body.task._id, { status: 'en_route' }, ctx.volunteer);
    const res = await setStatus(ctx, body.task._id, { status: 'partially_collected', quantityCollected: 42, reason: 'Only 42 left at pickup' }, ctx.volunteer);
    expect(res.status).toBe(200);
    const reservation = await Reservation.findById(ctx.reservation._id);
    expect(reservation).toMatchObject({ status: 'partially_collected', quantityCollected: 42, quantityShortage: 8 });
    expect((await CollectionTask.findById(body.task._id)).activeKey).toBeUndefined();
  });

  it('refuses impossible changes and missing reasons', async () => {
    const ctx = await setup();
    const { body } = await assign(ctx);
    expect((await setStatus(ctx, body.task._id, { status: 'delayed', delayMinutes: 20 })).status).toBe(400); // no reason
    await setStatus(ctx, body.task._id, { status: 'collected', quantityCollected: 50 });
    expect((await setStatus(ctx, body.task._id, { status: 'en_route' })).status).toBe(409); // collected is final
  });

  it('a missed pickup releases the food back to the listing', async () => {
    const ctx = await setup();
    const { body } = await assign(ctx);
    await setStatus(ctx, body.task._id, { status: 'missed', reason: 'Collector never arrived' });
    expect((await SurplusListing.findById(ctx.listing._id)).quantityReserved).toBe(0);
    expect((await Reservation.findById(ctx.reservation._id))).toMatchObject({ status: 'missed', quantityReleased: 50 });
  });
});

describe('Telegram', () => {
  it('sends assignment updates to connected users; the in-app notification exists either way', async () => {
    const ctx = await setup({ volunteerOnTelegram: true });
    const fetchSpy = fakeTelegram(true);
    await assign(ctx);
    const forVolunteer = await Notification.findOne({ user: ctx.volunteer.user._id, type: 'task.assigned' });
    expect(forVolunteer.telegram.status).toBe('sent');
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).chat_id).toBe('555');
    const forPoster = await Notification.findOne({ user: ctx.poster.user._id, type: 'task.assigned' });
    expect(forPoster.telegram.status).toBe('skipped'); // not connected: dashboard only
  });

  it('logs failures, and RETRY re-sends the same notification without creating a task or notification', async () => {
    const ctx = await setup({ volunteerOnTelegram: true });
    fakeTelegram(false);
    await assign(ctx);
    const failed = await Notification.findOne({ user: ctx.volunteer.user._id, type: 'task.assigned' });
    expect(failed.telegram).toMatchObject({ status: 'failed', attempts: 1, lastError: 'Telegram error: Bad Gateway' });

    const tasksBefore = await CollectionTask.countDocuments();
    const notificationsBefore = await Notification.countDocuments();
    vi.restoreAllMocks();
    fakeTelegram(true);
    const retry = await api().post(`/api/notifications/${failed._id}/retry`).set(ctx.coordinator.auth);
    expect(retry.body.notification.telegram).toMatchObject({ status: 'sent', attempts: 2 });
    expect(await CollectionTask.countDocuments()).toBe(tasksBefore);
    expect(await Notification.countDocuments()).toBe(notificationsBefore);

    const again = await api().post(`/api/notifications/${failed._id}/retry`).set(ctx.coordinator.auth);
    expect(again.status).toBe(409); // already sent: nothing to retry
  });

  it('the demo "outage" switch makes sends fail but tasks still work on the dashboard', async () => {
    const ctx = await setup({ volunteerOnTelegram: true });
    fakeTelegram(true);
    await setSetting('telegramFaultInjection', true);
    const res = await assign(ctx);
    expect(res.status).toBe(201); // the task exists
    const n = await Notification.findOne({ user: ctx.volunteer.user._id });
    expect(n.telegram.lastError).toMatch(/Simulated Telegram outage/);
    expect((await api().get('/api/tasks').set(ctx.volunteer.auth)).body.tasks).toHaveLength(1);
  });

  it('reminders are sent once per task, however often the job runs', async () => {
    const ctx = await setup();
    await assign(ctx);
    const first = await api().post('/api/tasks/reminders/send-due').set(ctx.coordinator.auth);
    const second = await api().post('/api/tasks/reminders/send-due').set(ctx.coordinator.auth);
    expect(first.body.remindersSent).toBe(1);
    expect(second.body.remindersSent).toBe(0);
    expect(await Notification.countDocuments({ type: 'task.reminder', user: ctx.volunteer.user._id })).toBe(1);
  });
});
