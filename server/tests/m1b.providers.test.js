import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDB, stopTestDB, resetTestDB, makeUser, api } from './helpers.js';
import { ProviderProfile } from '../models/ProviderProfile.js';
import { Credential } from '../models/Credential.js';
import { File } from '../models/File.js';
import { Notification } from '../models/Notification.js';
import { runExpiryCheck, assertBookable } from '../services/provider.service.js';

beforeAll(startTestDB);
afterAll(stopTestDB);
beforeEach(resetTestDB);

const profile = {
  businessName: 'Test Caterers',
  category: 'caterer',
  division: 'Dhaka',
  district: 'Dhaka',
  serviceAreas: ['Dhaka'],
  capacity: { min: 0, max: 300 },
  tags: ['halal'],
};
const PDF = Buffer.from('%PDF-1.4 test');
const days = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

// A provider account with a saved profile.
async function makeProvider(approvalStatus = 'approved') {
  const owner = await makeUser({ role: 'provider', approvalStatus });
  const res = await api().put('/api/providers/me').set(owner.auth).send(profile);
  return { ...owner, providerId: res.body.provider._id };
}

// Insert a credential directly (skipping upload) with a given status and expiry.
async function addCredential(providerId, ownerId, type, status, expiresAt) {
  const file = await File.create({ owner: ownerId, filename: 'x.pdf', mimeType: 'application/pdf', size: 10, data: PDF });
  return Credential.create({ provider: providerId, type, number: 'NUM-12345', expiresAt, file: file._id, status });
}

describe('profile and packages', () => {
  it('creates the profile once, then updates the same document', async () => {
    const owner = await makeUser({ role: 'provider' });
    const first = await api().put('/api/providers/me').set(owner.auth).send(profile);
    expect(first.status).toBe(201);
    const second = await api().put('/api/providers/me').set(owner.auth).send({ ...profile, businessName: 'Renamed' });
    expect(second.status).toBe(200);
    expect(await ProviderProfile.countDocuments()).toBe(1);
  });

  it('requires venues to give a capacity', async () => {
    const owner = await makeUser({ role: 'provider' });
    const res = await api().put('/api/providers/me').set(owner.auth).send({ ...profile, category: 'venue', capacity: { min: 0, max: 0 } });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('capacity.max');
  });

  it('hosts cannot edit provider profiles', async () => {
    const host = await makeUser({ role: 'host' });
    expect((await api().put('/api/providers/me').set(host.auth).send(profile)).status).toBe(403);
  });

  it('archives a package instead of deleting it, and hides it publicly', async () => {
    const provider = await makeProvider();
    const pkg = { name: 'Buffet', pricingType: 'per_guest', price: 800, minGuests: 50, maxGuests: 300, items: ['Biryani'] };
    const added = await api().post('/api/providers/me/packages').set(provider.auth).send(pkg);
    expect(added.status).toBe(201);

    await api().patch(`/api/providers/me/packages/${added.body.package._id}`).set(provider.auth).send({ ...pkg, isArchived: true });
    expect((await ProviderProfile.findById(provider.providerId)).packages).toHaveLength(1); // still stored

    const viewer = await makeUser({ role: 'host' });
    const publicView = await api().get(`/api/providers/${provider.providerId}`).set(viewer.auth);
    expect(publicView.body.provider.packages).toHaveLength(0); // but not shown
  });
});

describe('bookable rule', () => {
  it('needs an approved account and valid trade licence + food safety (caterer)', async () => {
    const provider = await makeProvider('approved');
    const me = async () => (await api().get('/api/providers/me').set(provider.auth)).body.bookability;

    expect((await me()).bookable).toBe(false);
    await addCredential(provider.providerId, provider.user._id, 'trade_licence', 'approved', days(100));
    expect((await me()).reasons).toEqual(['Food safety certificate is missing (upload it under Credentials)']);

    await addCredential(provider.providerId, provider.user._id, 'food_safety', 'approved', days(100));
    expect((await me()).bookable).toBe(true);
  });

  it('a pending account is not bookable even with valid documents', async () => {
    const provider = await makeProvider('pending');
    await addCredential(provider.providerId, provider.user._id, 'trade_licence', 'approved', days(100));
    await addCredential(provider.providerId, provider.user._id, 'food_safety', 'approved', days(100));
    const res = await api().get('/api/providers/me').set(provider.auth);
    expect(res.body.bookability.reasons).toContain('Account not yet approved by an administrator');
  });

  it('an expired document blocks new bookings and notifies the provider once', async () => {
    const provider = await makeProvider();
    await addCredential(provider.providerId, provider.user._id, 'trade_licence', 'approved', days(-1));
    await addCredential(provider.providerId, provider.user._id, 'food_safety', 'approved', days(100));

    await expect(assertBookable(provider.providerId)).rejects.toThrow(/Trade licence expired/);

    expect((await runExpiryCheck()).expiredFound).toBe(1);
    expect((await runExpiryCheck()).expiredFound).toBe(0); // second run: already handled
    expect(await Notification.countDocuments({ user: provider.user._id, type: 'credential.expired' })).toBe(1);
  });
});

describe('credential upload and review', () => {
  it('accepts a PDF, rejects other types and files over 1 MB', async () => {
    const provider = await makeProvider();
    const send = (buffer, filename, contentType) =>
      api()
        .post('/api/providers/me/credentials')
        .set(provider.auth)
        .field('type', 'trade_licence')
        .field('number', 'TRL-001')
        .field('expiresAt', days(365).toISOString())
        .attach('file', buffer, { filename, contentType });

    expect((await send(PDF, 'licence.pdf', 'application/pdf')).status).toBe(201);
    expect((await send(Buffer.from('hi'), 'notes.txt', 'text/plain')).status).toBe(400);
    const tooBig = await send(Buffer.alloc(1024 * 1024 + 1), 'big.pdf', 'application/pdf');
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error).toMatch(/1 MB/);
  });

  it('an admin can review a pending credential only once', async () => {
    const provider = await makeProvider();
    const admin = await makeUser({ role: 'admin' });
    const credential = await addCredential(provider.providerId, provider.user._id, 'trade_licence', 'pending', days(100));

    const first = await api().patch(`/api/admin/credentials/${credential._id}`).set(admin.auth).send({ status: 'approved' });
    expect(first.status).toBe(200);
    expect(first.body.credential.reviewedBy).toBe(String(admin.user._id));

    const second = await api().patch(`/api/admin/credentials/${credential._id}`).set(admin.auth).send({ status: 'rejected', note: 'x' });
    expect(second.status).toBe(409);
  });

  it('only the uploader and admins can open the file', async () => {
    const provider = await makeProvider();
    const credential = await addCredential(provider.providerId, provider.user._id, 'trade_licence', 'pending', days(100));
    const other = await makeUser({ role: 'provider' });
    const admin = await makeUser({ role: 'admin' });

    expect((await api().get(`/api/files/${credential.file}`).set(provider.auth)).status).toBe(200);
    expect((await api().get(`/api/files/${credential.file}`).set(admin.auth)).status).toBe(200);
    expect((await api().get(`/api/files/${credential.file}`).set(other.auth)).status).toBe(404);
  });

  it('the public page shows only reviewed credentials, with a masked number', async () => {
    const provider = await makeProvider();
    await addCredential(provider.providerId, provider.user._id, 'trade_licence', 'approved', days(100));
    await addCredential(provider.providerId, provider.user._id, 'food_safety', 'pending', days(100));
    const viewer = await makeUser({ role: 'host' });

    const res = await api().get(`/api/providers/${provider.providerId}`).set(viewer.auth);
    expect(res.body.reviewedCredentials).toHaveLength(1);
    expect(res.body.reviewedCredentials[0]).toMatchObject({ type: 'trade_licence', number: '••••2345', valid: true });
  });
});
