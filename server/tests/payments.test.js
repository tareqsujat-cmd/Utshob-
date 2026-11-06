import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { startTestDB, stopTestDB, resetTestDB, makeUser, api } from './helpers.js';
import { env } from '../config/env.js';
import { Event } from '../models/Event.js';
import { Contribution } from '../models/Contribution.js';
import { Payment } from '../models/Payment.js';

beforeAll(startTestDB);
afterAll(stopTestDB);
beforeEach(resetTestDB);
afterEach(() => {
  vi.restoreAllMocks();
  env.sslcommerz.storeId = '';
  env.sslcommerz.storePassword = '';
});

// A fake SSLCOMMERZ: answers the init call, and the validation call with `validation`.
function fakeGateway(validation = {}) {
  env.sslcommerz.storeId = 'teststore';
  env.sslcommerz.storePassword = 'secret';
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const body = String(url).includes('gwprocess')
      ? { status: 'SUCCESS', GatewayPageURL: 'https://sandbox.sslcommerz.com/pay/abc' }
      : validation;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

async function setup() {
  const host = await makeUser({ role: 'host' });
  const event = await Event.create({
    owner: host.user._id, organizers: [host.user._id], title: 'Wedding', eventType: 'wedding',
    startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000),
    location: { division: 'Dhaka', district: 'Dhaka' }, guestCount: 100, budgetTotal: 100000,
  });
  const contribution = await Contribution.create({ event: event._id, contributorName: 'Uncle Rafiq', type: 'cash', amountPledged: 5000 });
  return { host, event, contribution };
}

async function checkout(host, contribution, amount = 2000) {
  const res = await api().post(`/api/contributions/${contribution._id}/checkout`).set(host.auth).send({ amount });
  return res;
}

describe('sandbox checkout', () => {
  it('without store credentials: 503 with a manual fallback message', async () => {
    const { host, contribution } = await setup();
    const res = await checkout(host, contribution);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/Record the payment manually/);
  });

  it('gateway down: 502 and the payment is marked failed', async () => {
    const { host, contribution } = await setup();
    env.sslcommerz.storeId = 'teststore';
    env.sslcommerz.storePassword = 'secret';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const res = await checkout(host, contribution);
    expect(res.status).toBe(502);
    expect((await Payment.findOne()).status).toBe('failed');
  });

  it('IDEMPOTENT: success callback + IPN for the same payment count the money once', async () => {
    const { host, contribution } = await setup();
    fakeGateway(); // init only for now
    const start = await checkout(host, contribution, 2000);
    expect(start.body.gatewayUrl).toMatch(/sslcommerz/);
    const tranId = start.body.tranId;

    fakeGateway({ status: 'VALID', tran_id: tranId, amount: '2000.00', currency: 'BDT', val_id: 'V1', card_type: 'BKASH-BKash' });
    const callback = { tran_id: tranId, val_id: 'V1', status: 'VALID' };
    const success = await api().post('/api/payments/sslcommerz/success').type('form').send(callback);
    expect(success.status).toBe(303);
    expect(success.headers.location).toContain(`/payments/${tranId}`);
    await api().post('/api/payments/sslcommerz/ipn').type('form').send(callback);
    await api().post('/api/payments/sslcommerz/success').type('form').send(callback);

    const after = await Contribution.findById(contribution._id);
    expect(after.amountReceived).toBe(2000); // not 4000 or 6000
    expect(after.receipts).toHaveLength(1);
    expect(after.amountPledged).toBe(5000); // pledge untouched: kept separate
    expect(after.status).toBe('partially_received');
    expect((await Payment.findOne({ tranId })).status).toBe('paid');
  });

  it('never trusts a validation answer for a different amount', async () => {
    const { host, contribution } = await setup();
    fakeGateway();
    const { tranId } = (await checkout(host, contribution, 2000)).body;
    fakeGateway({ status: 'VALID', tran_id: tranId, amount: '20.00', currency: 'BDT', val_id: 'V2' });
    await api().post('/api/payments/sslcommerz/success').type('form').send({ tran_id: tranId, val_id: 'V2' });

    expect((await Payment.findOne({ tranId })).status).toBe('failed');
    expect((await Contribution.findById(contribution._id)).amountReceived).toBe(0);
  });

  it('cancel on the gateway page marks the payment cancelled', async () => {
    const { host, contribution } = await setup();
    fakeGateway();
    const { tranId } = (await checkout(host, contribution)).body;
    await api().post('/api/payments/sslcommerz/cancel').type('form').send({ tran_id: tranId });
    expect((await Payment.findOne({ tranId })).status).toBe('cancelled');
  });

  it('"Check status" confirms a payment whose browser never came back', async () => {
    const { host, contribution } = await setup();
    fakeGateway();
    const { tranId } = (await checkout(host, contribution, 1000)).body;
    fakeGateway({ APIConnect: 'DONE', element: [{ status: 'VALID', tran_id: tranId, amount: '1000.00', currency: 'BDT', val_id: 'V3' }] });

    const res = await api().post(`/api/payments/${tranId}/verify`).set(host.auth);
    expect(res.body.payment.status).toBe('paid');
    expect((await Contribution.findById(contribution._id)).amountReceived).toBe(1000);

    const stranger = await makeUser({ role: 'host' });
    expect((await api().get(`/api/payments/${tranId}`).set(stranger.auth)).status).toBe(404);
  });
});
