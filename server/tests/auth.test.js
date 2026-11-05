import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDB, stopTestDB, resetTestDB, api } from './helpers.js';
import { Organization } from '../models/Organization.js';

const host = {
  name: 'Test Host',
  email: 'Host@Example.com',
  password: 'secret123',
  role: 'host',
  division: 'Dhaka',
  district: 'Gazipur',
};

beforeAll(startTestDB);
afterAll(stopTestDB);
beforeEach(resetTestDB);

describe('signup', () => {
  it('creates an approved host and returns a token, without the password hash', async () => {
    const res = await api().post('/api/auth/signup').send(host);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('host@example.com'); // stored in lowercase
    expect(res.body.user.approvalStatus).toBe('approved');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('starts providers as pending', async () => {
    const res = await api().post('/api/auth/signup').send({ ...host, role: 'provider' });
    expect(res.body.user.approvalStatus).toBe('pending');
  });

  it('creates the organization for a coordinator', async () => {
    const res = await api()
      .post('/api/auth/signup')
      .send({ ...host, role: 'orphanage_coordinator', organizationName: 'Test Home', receivingCapacity: 30 });
    expect(res.status).toBe(201);
    const org = await Organization.findById(res.body.user.organization);
    expect(org.type).toBe('orphanage');
    expect(org.approvalStatus).toBe('pending');
  });

  it('rejects a coordinator without organization name, naming the field', async () => {
    const res = await api().post('/api/auth/signup').send({ ...host, role: 'outreach_coordinator' });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toContain('organizationName');
  });

  it('rejects a district from another division', async () => {
    const res = await api().post('/api/auth/signup').send({ ...host, district: 'Sylhet' });
    expect(res.status).toBe(400);
  });

  it('does not allow signing up as admin', async () => {
    const res = await api().post('/api/auth/signup').send({ ...host, role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('refuses a duplicate email', async () => {
    await api().post('/api/auth/signup').send(host);
    const res = await api().post('/api/auth/signup').send({ ...host, email: 'host@example.com' });
    expect(res.status).toBe(409);
  });
});

describe('login and me', () => {
  it('logs in with the right password only', async () => {
    await api().post('/api/auth/signup').send(host);
    const wrong = await api().post('/api/auth/login').send({ email: host.email, password: 'nope' });
    expect(wrong.status).toBe(401);
    const right = await api().post('/api/auth/login').send({ email: host.email, password: host.password });
    expect(right.status).toBe(200);
    expect(right.body.token).toBeTruthy();
  });

  it('GET /me needs a valid token and returns the Starter plan', async () => {
    const noToken = await api().get('/api/auth/me');
    expect(noToken.status).toBe(401);

    const badToken = await api().get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(badToken.status).toBe(401);

    const { body } = await api().post('/api/auth/signup').send(host);
    const res = await api().get('/api/auth/me').set('Authorization', `Bearer ${body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Test Host');
    expect(res.body.plan.code).toBe('starter');
  });
});
