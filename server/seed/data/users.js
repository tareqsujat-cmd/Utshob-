import bcrypt from 'bcryptjs';
import { User } from '../../models/User.js';
import { Organization } from '../../models/Organization.js';

export const DEMO_PASSWORD = 'Demo@1234';

// One demo account per role (plus a few extra to show approvals and permissions).
// Synthetic people and organizations; any resemblance to real ones is accidental.
const DEMO_USERS = [
  { key: 'admin', name: 'Arif Hossain', email: 'admin@utshob.demo', role: 'admin', division: 'Dhaka', district: 'Dhaka' },
  { key: 'host', name: 'Nusrat Rahman', email: 'host@utshob.demo', role: 'host', division: 'Dhaka', district: 'Dhaka', phone: '01711000001' },
  { key: 'host2', name: 'Imran Chowdhury', email: 'host2@utshob.demo', role: 'host', division: 'Chattogram', district: 'Chattogram', phone: '01811000002' },
  {
    key: 'orphanage', name: 'Rokeya Begum', email: 'orphanage@utshob.demo', role: 'orphanage_coordinator',
    division: 'Dhaka', district: 'Dhaka', phone: '01911000003',
    org: { name: 'Shishu Nibash Children\'s Home', type: 'orphanage', address: 'Road 7, Mirpur 10, Dhaka', capacity: 80, lat: 23.8069, lng: 90.3687 },
  },
  {
    key: 'outreach', name: 'Tanvir Ahmed', email: 'outreach@utshob.demo', role: 'outreach_coordinator',
    division: 'Dhaka', district: 'Dhaka', phone: '01611000004',
    org: { name: 'Pothshishu Street Outreach', type: 'outreach', address: 'Kamalapur Station Road, Dhaka', capacity: 50, lat: 23.7326, lng: 90.4266 },
  },
  { key: 'volunteer', name: 'Sadia Islam', email: 'volunteer@utshob.demo', role: 'volunteer', division: 'Dhaka', district: 'Dhaka', phone: '01511000005' },
  { key: 'volunteer2', name: 'Rahat Karim', email: 'volunteer2@utshob.demo', role: 'volunteer', division: 'Dhaka', district: 'Gazipur', phone: '01511000006' },
  // Waiting for approval, so the admin approval queue has something to show.
  {
    key: 'pendingCoordinator', name: 'Mitali Das', email: 'pending.orphanage@utshob.demo', role: 'orphanage_coordinator',
    division: 'Khulna', district: 'Khulna', phone: '01911000007', approvalStatus: 'pending',
    org: { name: 'Rupsha Orphanage', type: 'orphanage', address: 'Rupsha, Khulna', capacity: 40, lat: 22.8135, lng: 89.5672 },
  },
];

// Creates the users (and coordinators' organizations). Returns them keyed by `key`,
// e.g. users.host, so later seed steps can refer to them.
export async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = {};

  for (const demo of DEMO_USERS) {
    const user = await User.create({
      name: demo.name,
      email: demo.email,
      passwordHash,
      role: demo.role,
      phone: demo.phone || '',
      division: demo.division,
      district: demo.district,
      approvalStatus: demo.approvalStatus || 'approved',
    });

    if (demo.org) {
      const organization = await Organization.create({
        name: demo.org.name,
        type: demo.org.type,
        division: demo.division,
        district: demo.district,
        address: demo.org.address,
        location: { lat: demo.org.lat, lng: demo.org.lng },
        contactPhone: demo.phone,
        defaultReceivingCapacity: demo.org.capacity,
        coordinators: [user._id],
        approvalStatus: demo.approvalStatus || 'approved',
      });
      user.organization = organization._id;
      await user.save();
    }
    users[demo.key] = user;
  }
  return users;
}
