import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDB, stopTestDB, resetTestDB, makeUser, api } from './helpers.js';
import { Organization } from '../models/Organization.js';
import { AuditLog } from '../models/AuditLog.js';
import { Notification } from '../models/Notification.js';

beforeAll(startTestDB);
afterAll(stopTestDB);
beforeEach(resetTestDB);

describe('role checks', () => {
  it('blocks non-admins from admin routes (403) and anonymous users (401)', async () => {
    const host = await makeUser({ role: 'host' });
    expect((await api().get('/api/admin/approvals').set(host.auth)).status).toBe(403);
    expect((await api().get('/api/admin/approvals')).status).toBe(401);
  });

  it('only coordinators can open /organizations/mine', async () => {
    const host = await makeUser({ role: 'host' });
    expect((await api().get('/api/organizations/mine').set(host.auth)).status).toBe(403);
  });
});

describe('admin approval', () => {
  async function pendingCoordinator() {
    const coordinator = await makeUser({ role: 'orphanage_coordinator', approvalStatus: 'pending' });
    const org = await Organization.create({
      name: 'Home',
      type: 'orphanage',
      division: 'Dhaka',
      district: 'Dhaka',
      coordinators: [coordinator.user._id],
    });
    coordinator.user.organization = org._id;
    await coordinator.user.save();
    return { coordinator, org };
  }

  it('approves the user and their organization, with audit log and notification', async () => {
    const admin = await makeUser({ role: 'admin' });
    const { coordinator, org } = await pendingCoordinator();

    const res = await api()
      .patch(`/api/admin/users/${coordinator.user._id}/approval`)
      .set(admin.auth)
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.user.approvalStatus).toBe('approved');
    expect((await Organization.findById(org._id)).approvalStatus).toBe('approved');
    expect(await AuditLog.countDocuments({ action: 'user.approve', entityId: coordinator.user._id })).toBe(1);
    expect(await Notification.countDocuments({ user: coordinator.user._id })).toBe(1);
  });

  it('requires a reason to reject', async () => {
    const admin = await makeUser({ role: 'admin' });
    const { coordinator } = await pendingCoordinator();
    const res = await api()
      .patch(`/api/admin/users/${coordinator.user._id}/approval`)
      .set(admin.auth)
      .send({ status: 'rejected' });
    expect(res.status).toBe(400);
  });
});

describe('record-level permission', () => {
  it("cannot mark someone else's notification as read", async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const note = await Notification.create({ user: alice.user._id, type: 'x', title: 'For Alice' });

    const res = await api().patch(`/api/notifications/${note._id}/read`).set(bob.auth);
    expect(res.status).toBe(404);
    expect((await Notification.findById(note._id)).readAt).toBeNull();
  });
});
