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

// Approximate centre of each division, used to centre maps.
export const DIVISION_CENTERS = {
  Dhaka: { lat: 23.8103, lng: 90.4125 },
  Chattogram: { lat: 22.3569, lng: 91.7832 },
  Rajshahi: { lat: 24.3745, lng: 88.6042 },
  Khulna: { lat: 22.8456, lng: 89.5403 },
  Barishal: { lat: 22.701, lng: 90.3535 },
  Sylhet: { lat: 24.8949, lng: 91.8687 },
  Rangpur: { lat: 25.7439, lng: 89.2752 },
  Mymensingh: { lat: 24.7471, lng: 90.4203 },
};

export const ORGANIZATION_TYPES = ['orphanage', 'outreach'];

// ---- M1-B Providers ----
export const PROVIDER_CATEGORIES = ['venue', 'caterer', 'restaurant', 'planner'];
export const PROVIDER_CATEGORY_LABELS = {
  venue: 'Venue',
  caterer: 'Caterer',
  restaurant: 'Restaurant',
  planner: 'Event planner / decorator',
};

export const CREDENTIAL_TYPES = ['trade_licence', 'food_safety', 'fire_safety', 'other'];
export const CREDENTIAL_LABELS = {
  trade_licence: 'Trade licence',
  food_safety: 'Food safety certificate',
  fire_safety: 'Fire safety certificate',
  other: 'Other document',
};

// Documents a provider needs (approved and not expired) before it may accept bookings.
export const REQUIRED_CREDENTIALS = {
  venue: ['trade_licence', 'fire_safety'],
  caterer: ['trade_licence', 'food_safety'],
  restaurant: ['trade_licence', 'food_safety'],
  planner: ['trade_licence'],
};

// Services and preferences a provider can offer (used for search in M2-B).
export const PROVIDER_TAGS = [
  'halal', 'vegetarian_options', 'vegan_options', 'air_conditioned', 'parking', 'decoration',
  'live_cooking', 'outdoor_space', 'wheelchair_access', 'sound_system', 'photography', 'delivery',
];
export const PROVIDER_TAG_LABELS = {
  halal: 'Halal',
  vegetarian_options: 'Vegetarian options',
  vegan_options: 'Vegan options',
  air_conditioned: 'Air-conditioned',
  parking: 'Parking',
  decoration: 'Decoration',
  live_cooking: 'Live cooking',
  outdoor_space: 'Outdoor space',
  wheelchair_access: 'Wheelchair access',
  sound_system: 'Sound system',
  photography: 'Photography',
  delivery: 'Delivery',
};

// ---- M1-A Events ----
export const EVENT_TYPES = ['wedding', 'birthday', 'corporate', 'religious', 'community', 'other'];
export const EVENT_TYPE_LABELS = {
  wedding: 'Wedding', birthday: 'Birthday', corporate: 'Corporate', religious: 'Religious (iftar, puja, milad …)',
  community: 'Community', other: 'Other',
};
export const EVENT_STATUSES = ['draft', 'planned', 'cancelled', 'completed'];
export const ACTIVE_EVENT_STATUSES = ['draft', 'planned']; // these count against the plan limit

export const BUDGET_CATEGORIES = ['food', 'venue', 'decoration', 'transport', 'other'];
export const BUDGET_CATEGORY_LABELS = { food: 'Food', venue: 'Venue', decoration: 'Decoration', transport: 'Transport', other: 'Other' };

// Services an event may need, and the budget line each one is paid from.
export const REQUIRED_SERVICES = ['venue', 'catering', 'decoration', 'transport'];
export const SERVICE_LABELS = { venue: 'Venue', catering: 'Catering', decoration: 'Decoration / planning', transport: 'Transport' };
export const SERVICE_BUDGET_CATEGORY = { venue: 'venue', catering: 'food', decoration: 'decoration', transport: 'transport' };

export const FOOD_UNITS = ['portion', 'kg', 'piece', 'litre'];
export const MENU_COURSES = ['starter', 'main', 'side', 'dessert', 'drink'];
export const DIETARY_LABELS = {
  vegetarian: 'Vegetarian', vegan: 'Vegan', halal: 'Halal only', diabetic: 'Diabetic', nut_allergy: 'Nut allergy',
  gluten_free: 'Gluten free', other: 'Other',
};
export const BATCH_STATUSES = ['planned', 'started', 'completed', 'cancelled'];
// Which status changes are allowed for a cooking batch.
export const BATCH_TRANSITIONS = { planned: ['started', 'cancelled'], started: ['completed'], completed: [], cancelled: [] };

// Invitation designs: a small fixed set the host (or the AI in M3-A) can choose from.
export const INVITATION_PALETTES = ['marigold', 'teal', 'rose', 'night'];
export const INVITATION_FONTS = ['classic', 'modern'];
export const INVITATION_LAYOUTS = ['centered', 'banner'];

// ---- M1-C Surplus food ----
export const ALLERGENS = ['nuts', 'peanuts', 'milk', 'egg', 'fish', 'shellfish', 'gluten', 'soy', 'sesame'];
export const ALLERGEN_LABELS = {
  nuts: 'Tree nuts', peanuts: 'Peanuts', milk: 'Milk / dairy', egg: 'Egg', fish: 'Fish', shellfish: 'Shellfish',
  gluten: 'Wheat / gluten', soy: 'Soy', sesame: 'Sesame',
};
export const STORAGE_CONDITIONS = ['hot_holding', 'room_temperature', 'refrigerated', 'frozen'];
export const STORAGE_LABELS = {
  hot_holding: 'Kept hot', room_temperature: 'Room temperature', refrigerated: 'Refrigerated', frozen: 'Frozen',
};
export const PACKAGING_TYPES = ['sealed_containers', 'foil_trays', 'food_grade_bags', 'bulk_pots', 'other'];
export const PACKAGING_LABELS = {
  sealed_containers: 'Sealed containers', foil_trays: 'Foil trays', food_grade_bags: 'Food-grade bags',
  bulk_pots: 'Bulk pots (bring containers)', other: 'Other',
};
export const LISTING_STATUSES = ['open', 'fully_reserved', 'closed', 'cancelled', 'completed'];
export const REQUEST_STATUSES = ['open', 'partially_matched', 'fulfilled', 'cancelled'];
export const RESERVATION_STATUSES = ['reserved', 'collection_assigned', 'collected', 'partially_collected', 'cancelled', 'missed', 'closed'];

// Uploaded documents: allowed file types and size.
export const UPLOAD_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
export const UPLOAD_MAX_BYTES = 1024 * 1024; // 1 MB

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];
