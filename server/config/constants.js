// Fixed lists (enumerations) used by Mongoose schemas, zod validators and the
// client (served through GET /api/meta, so React never hardcodes them).

export const ROLES = [
  'host',
  'provider',
  'orphanage_coordinator',
  'outreach_coordinator',
  'volunteer',
  'admin',
];

// These roles must be approved by an admin before they can use operational features.
export const ROLES_NEEDING_APPROVAL = ['provider', 'orphanage_coordinator', 'outreach_coordinator'];

// Admin accounts are only created by the seed script, never through signup.
export const SIGNUP_ROLES = ROLES.filter((role) => role !== 'admin');

export const COORDINATOR_ROLES = ['orphanage_coordinator', 'outreach_coordinator'];

export const ROLE_LABELS = {
  host: 'Event host',
  provider: 'Service provider',
  orphanage_coordinator: 'Orphanage coordinator',
  outreach_coordinator: 'Outreach coordinator',
  volunteer: 'Volunteer',
  admin: 'Administrator',
};

// Bangladesh: 8 divisions and their 64 districts.
export const DIVISIONS = {
  Dhaka: ['Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Kishoreganj', 'Madaripur', 'Manikganj',
    'Munshiganj', 'Narayanganj', 'Narsingdi', 'Rajbari', 'Shariatpur', 'Tangail'],
  Chattogram: ['Bandarban', 'Brahmanbaria', 'Chandpur', 'Chattogram', "Cox's Bazar", 'Cumilla',
    'Feni', 'Khagrachhari', 'Lakshmipur', 'Noakhali', 'Rangamati'],
  Rajshahi: ['Bogura', 'Chapainawabganj', 'Joypurhat', 'Naogaon', 'Natore', 'Pabna', 'Rajshahi',
    'Sirajganj'],
  Khulna: ['Bagerhat', 'Chuadanga', 'Jashore', 'Jhenaidah', 'Khulna', 'Kushtia', 'Magura',
    'Meherpur', 'Narail', 'Satkhira'],
  Barishal: ['Barguna', 'Barishal', 'Bhola', 'Jhalokati', 'Patuakhali', 'Pirojpur'],
  Sylhet: ['Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet'],
  Rangpur: ['Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari', 'Panchagarh',
    'Rangpur', 'Thakurgaon'],
  Mymensingh: ['Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur'],
};

export const DIVISION_NAMES = Object.keys(DIVISIONS);

export const ORGANIZATION_TYPES = ['orphanage', 'outreach'];

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];
