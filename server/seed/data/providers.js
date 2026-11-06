import { User } from '../../models/User.js';
import { ProviderProfile } from '../../models/ProviderProfile.js';
import { Credential } from '../../models/Credential.js';
import { File } from '../../models/File.js';
import { REQUIRED_CREDENTIALS, CREDENTIAL_LABELS } from '../../config/constants.js';
import { makeDemoPdf } from './demoPdf.js';

const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

// Synthetic providers across all 8 divisions. Emails ending in @utshob.demo appear as
// one-click demo logins; the others (@providers.demo) are background data for search.
// `credentials` overrides the default (all required documents approved, valid for a year).
const PROVIDERS = [
  // --- The demo scenario: "Wedding reception, Dhaka" uses these three ---
  {
    key: 'venue', email: 'venue@utshob.demo', owner: 'Kamal Uddin', businessName: 'Shapla Convention Hall',
    category: 'venue', division: 'Dhaka', district: 'Dhaka', address: 'Road 27, Dhanmondi, Dhaka', lat: 23.7461, lng: 90.3742,
    serviceAreas: ['Dhaka'], capacity: { min: 100, max: 500 }, allowsOutsideCatering: true,
    tags: ['air_conditioned', 'parking', 'sound_system', 'wheelchair_access', 'decoration'],
    description: 'Air-conditioned hall with a garden entrance, popular for weddings and receptions.',
    packages: [
      { name: 'Evening reception (6 hours)', pricingType: 'flat', price: 70000, minGuests: 100, maxGuests: 500, items: ['Hall for 6 hours', 'Basic lighting', 'Stage', 'Parking for 60 cars'] },
      { name: 'Full-day hall rental', pricingType: 'flat', price: 110000, minGuests: 100, maxGuests: 500, items: ['Hall for 12 hours', 'Bridal room', 'Generator backup'] },
    ],
  },
  {
    key: 'caterer', email: 'caterer@utshob.demo', owner: 'Farida Yasmin', businessName: 'Bhoj Caterers',
    category: 'caterer', division: 'Dhaka', district: 'Dhaka', address: 'Block C, Mohammadpur, Dhaka', lat: 23.7656, lng: 90.3586,
    serviceAreas: ['Dhaka'], capacity: { min: 50, max: 800 },
    tags: ['halal', 'vegetarian_options', 'live_cooking', 'delivery'],
    description: 'Home-style Bangladeshi wedding catering: kacchi biryani, roast and borhani.',
    packages: [
      { name: 'Wedding kacchi buffet', pricingType: 'per_guest', price: 250, minGuests: 50, maxGuests: 800, items: ['Kacchi biryani', 'Chicken roast', 'Borhani', 'Firni'] },
      { name: 'Premium wedding buffet', pricingType: 'per_guest', price: 650, minGuests: 100, maxGuests: 600, items: ['Kacchi biryani', 'Beef rezala', 'Fish fry', 'Two desserts', 'Live tea station'] },
    ],
  },
  {
    key: 'decor', email: 'decor@utshob.demo', owner: 'Rina Akter', businessName: 'Rongdhonu Decor & Events',
    category: 'planner', division: 'Dhaka', district: 'Dhaka', address: 'Road 11, Banani, Dhaka', lat: 23.7937, lng: 90.4066,
    serviceAreas: ['Dhaka', 'Mymensingh'], tags: ['decoration', 'photography', 'sound_system'],
    description: 'Stage, floral and lighting decoration; full event planning on request.',
    packages: [
      { name: 'Stage & floral decoration', pricingType: 'flat', price: 30000, minGuests: 1, maxGuests: 600, items: ['Stage backdrop', 'Fresh flowers', 'Entrance gate', 'Fairy lights'] },
      { name: 'Full event planning', pricingType: 'flat', price: 60000, minGuests: 1, maxGuests: 600, items: ['Decoration', 'Coordinator on the day', 'Vendor management'] },
    ],
  },
  // --- Waiting for admin approval (shows the review workflow) ---
  {
    key: 'pendingProvider', email: 'pending.provider@utshob.demo', owner: 'Jahid Hasan', businessName: 'Nakshi Kitchen Caterers',
    category: 'caterer', division: 'Dhaka', district: 'Narayanganj', address: 'Chashara, Narayanganj', lat: 23.6238, lng: 90.5,
    serviceAreas: ['Dhaka'], capacity: { min: 30, max: 300 }, tags: ['halal', 'delivery'], approvalStatus: 'pending',
    packages: [{ name: 'Family feast', pricingType: 'per_guest', price: 380, minGuests: 30, maxGuests: 300, items: ['Polao', 'Chicken korma', 'Salad'] }],
    credentials: [
      { type: 'trade_licence', status: 'pending', days: 400 },
      { type: 'food_safety', status: 'pending', days: 300 },
    ],
  },
  // --- More Dhaka providers (for search in M2-B) ---
  {
    email: 'gulshan@providers.demo', owner: 'Tahmid Rahman', businessName: 'Gulshan Grand Ballroom',
    category: 'venue', division: 'Dhaka', district: 'Dhaka', address: 'Gulshan Avenue, Dhaka', lat: 23.7925, lng: 90.4078,
    serviceAreas: ['Dhaka'], capacity: { min: 150, max: 600 }, allowsOutsideCatering: false,
    tags: ['air_conditioned', 'parking', 'sound_system', 'wheelchair_access'],
    description: 'Luxury ballroom. In-house catering only.',
    packages: [{ name: 'Ballroom evening with in-house dinner', pricingType: 'flat', price: 180000, minGuests: 150, maxGuests: 600, items: ['Ballroom 6 hours', 'In-house dinner menu'] }],
  },
  {
    email: 'lakeview@providers.demo', owner: 'Shirin Sultana', businessName: 'Dhanmondi Lake Pavilion',
    category: 'venue', division: 'Dhaka', district: 'Dhaka', address: 'Road 8, Dhanmondi, Dhaka', lat: 23.7465, lng: 90.376,
    serviceAreas: ['Dhaka'], capacity: { min: 40, max: 200 }, tags: ['outdoor_space', 'parking'],
    packages: [{ name: 'Lakeside evening', pricingType: 'flat', price: 45000, minGuests: 40, maxGuests: 200, items: ['Pavilion 5 hours', 'Garden lights'] }],
  },
  {
    email: 'biryani@providers.demo', owner: 'Haji Abdul Karim', businessName: 'Puran Dhaka Biryani House',
    category: 'restaurant', division: 'Dhaka', district: 'Dhaka', address: 'Lalbagh Road, Old Dhaka', lat: 23.7189, lng: 90.3882,
    serviceAreas: ['Dhaka'], capacity: { min: 20, max: 150 }, tags: ['halal', 'delivery'],
    packages: [{ name: 'Old Dhaka biryani platter', pricingType: 'per_guest', price: 350, minGuests: 20, maxGuests: 150, items: ['Mutton kacchi', 'Jali kebab', 'Borhani'] }],
  },
  {
    email: 'mirpurkitchen@providers.demo', owner: 'Nasima Khatun', businessName: 'Mirpur Home Kitchen',
    category: 'caterer', division: 'Dhaka', district: 'Dhaka', address: 'Section 6, Mirpur, Dhaka', lat: 23.8155, lng: 90.3656,
    serviceAreas: ['Dhaka'], capacity: { min: 20, max: 120 }, tags: ['halal', 'vegetarian_options', 'vegan_options'],
    packages: [{ name: 'Simple home-style meal', pricingType: 'per_guest', price: 300, minGuests: 20, maxGuests: 120, items: ['Rice', 'Dal', 'Chicken curry', 'Vegetable bhaji'] }],
  },
  {
    email: 'bhawal@providers.demo', owner: 'Mahbub Alam', businessName: 'Bhawal Resort Garden',
    category: 'venue', division: 'Dhaka', district: 'Gazipur', address: 'Rajendrapur, Gazipur', lat: 24.0958, lng: 90.4125,
    serviceAreas: ['Dhaka'], capacity: { min: 100, max: 400 }, tags: ['outdoor_space', 'parking'],
    packages: [{ name: 'Garden day event', pricingType: 'flat', price: 85000, minGuests: 100, maxGuests: 400, items: ['Garden 10 hours', 'Tents'] }],
  },
  // --- Other divisions ---
  {
    email: 'karnaphuli@providers.demo', owner: 'Sajjad Hossain', businessName: 'Karnaphuli Banquet',
    category: 'venue', division: 'Chattogram', district: 'Chattogram', address: 'Agrabad, Chattogram', lat: 22.3256, lng: 91.8123,
    serviceAreas: ['Chattogram'], capacity: { min: 100, max: 450 }, tags: ['air_conditioned', 'parking'],
    packages: [{ name: 'Banquet evening', pricingType: 'flat', price: 65000, minGuests: 100, maxGuests: 450, items: ['Hall 6 hours', 'Stage'] }],
  },
  {
    email: 'bayspice@providers.demo', owner: 'Nusrat Jahan', businessName: 'Bay Spice Caterers',
    category: 'caterer', division: 'Chattogram', district: 'Chattogram', address: 'GEC Circle, Chattogram', lat: 22.3594, lng: 91.8212,
    serviceAreas: ['Chattogram'], capacity: { min: 50, max: 500 }, tags: ['halal', 'live_cooking'],
    packages: [{ name: 'Mezban feast', pricingType: 'per_guest', price: 450, minGuests: 50, maxGuests: 500, items: ['Mezbani beef', 'Chana dal', 'Rice'] }],
  },
  {
    email: 'teavalley@providers.demo', owner: 'Anwar Chowdhury', businessName: 'Tea Valley Kitchen',
    category: 'restaurant', division: 'Sylhet', district: 'Sylhet', address: 'Zindabazar, Sylhet', lat: 24.8949, lng: 91.8687,
    serviceAreas: ['Sylhet'], capacity: { min: 20, max: 120 }, tags: ['halal', 'vegetarian_options'],
    packages: [{ name: 'Sylheti set menu', pricingType: 'per_guest', price: 400, minGuests: 20, maxGuests: 120, items: ['Akhni', 'Satkora beef', 'Fish curry'] }],
  },
  {
    email: 'padma@providers.demo', owner: 'Rafiqul Islam', businessName: 'Padma Feast Caterers',
    category: 'caterer', division: 'Rajshahi', district: 'Rajshahi', address: 'Shaheb Bazar, Rajshahi', lat: 24.3636, lng: 88.6241,
    serviceAreas: ['Rajshahi'], capacity: { min: 50, max: 400 }, tags: ['halal', 'delivery'],
    packages: [{ name: 'Rajshahi wedding menu', pricingType: 'per_guest', price: 320, minGuests: 50, maxGuests: 400, items: ['Kalai roti', 'Beef bhuna', 'Mango dessert'] }],
  },
  {
    // Fire safety certificate expired 10 days ago: shows "new bookings blocked".
    email: 'sundarban@providers.demo', owner: 'Mostafa Kamal', businessName: 'Sundarban Hall',
    category: 'venue', division: 'Khulna', district: 'Khulna', address: 'KDA Avenue, Khulna', lat: 22.8158, lng: 89.5628,
    serviceAreas: ['Khulna'], capacity: { min: 80, max: 350 }, tags: ['air_conditioned'],
    packages: [{ name: 'Hall evening', pricingType: 'flat', price: 50000, minGuests: 80, maxGuests: 350, items: ['Hall 6 hours'] }],
    credentials: [
      { type: 'trade_licence', status: 'approved', days: 200 },
      { type: 'fire_safety', status: 'approved', days: -10 },
    ],
  },
  {
    email: 'kirtankhola@providers.demo', owner: 'Shahana Parvin', businessName: 'Kirtankhola Kitchen',
    category: 'restaurant', division: 'Barishal', district: 'Barishal', address: 'Sadar Road, Barishal', lat: 22.701, lng: 90.3535,
    serviceAreas: ['Barishal'], capacity: { min: 20, max: 100 }, tags: ['halal'],
    packages: [{ name: 'River fish menu', pricingType: 'per_guest', price: 380, minGuests: 20, maxGuests: 100, items: ['Hilsa', 'Rice', 'Dal'] }],
  },
  {
    email: 'teesta@providers.demo', owner: 'Abu Sayeed', businessName: 'Teesta Event Planners',
    category: 'planner', division: 'Rangpur', district: 'Rangpur', address: 'Jahaj Company More, Rangpur', lat: 25.7439, lng: 89.2752,
    serviceAreas: ['Rangpur', 'Rajshahi'], tags: ['decoration', 'photography'],
    packages: [{ name: 'Wedding decoration', pricingType: 'flat', price: 25000, minGuests: 1, maxGuests: 500, items: ['Stage', 'Flowers', 'Lighting'] }],
  },
  {
    email: 'brahmaputra@providers.demo', owner: 'Lutfun Nahar', businessName: 'Brahmaputra Banquet',
    category: 'venue', division: 'Mymensingh', district: 'Mymensingh', address: 'Ganginar Par, Mymensingh', lat: 24.7539, lng: 90.4073,
    serviceAreas: ['Mymensingh'], capacity: { min: 60, max: 300 }, tags: ['parking', 'outdoor_space'],
    packages: [{ name: 'Banquet evening', pricingType: 'flat', price: 40000, minGuests: 60, maxGuests: 300, items: ['Hall 6 hours'] }],
  },
];

// Creates provider accounts, profiles, packages and credentials (with a small PDF each).
// Returns { [key]: { user, provider } } for the providers that have a key.
export async function seedProviders(passwordHash, admin) {
  const result = {};

  for (const [index, p] of PROVIDERS.entries()) {
    const user = await User.create({
      name: p.owner,
      email: p.email,
      passwordHash,
      role: 'provider',
      phone: `0171200${String(index).padStart(4, '0')}`,
      division: p.division,
      district: p.district,
      approvalStatus: p.approvalStatus || 'approved',
    });

    const provider = await ProviderProfile.create({
      user: user._id,
      businessName: p.businessName,
      category: p.category,
      description: p.description || '',
      phone: user.phone,
      address: p.address,
      division: p.division,
      district: p.district,
      location: { lat: p.lat, lng: p.lng },
      serviceAreas: p.serviceAreas.map((division) => ({ division })),
      capacity: p.capacity || { min: 0, max: 0 },
      allowsOutsideCatering: p.allowsOutsideCatering ?? true,
      tags: p.tags,
      packages: p.packages,
    });

    // Default: every required document approved by the admin a month ago, valid for a year.
    const credentials =
      p.credentials || REQUIRED_CREDENTIALS[p.category].map((type) => ({ type, status: 'approved', days: 365 }));

    for (const [i, c] of credentials.entries()) {
      const number = `${c.type === 'trade_licence' ? 'TRL' : c.type === 'food_safety' ? 'BFSA' : 'FSC'}-2026-${String(index * 10 + i).padStart(4, '0')}`;
      const pdf = makeDemoPdf([
        `${CREDENTIAL_LABELS[c.type]} (SYNTHETIC DEMO DOCUMENT)`,
        `Business: ${p.businessName}`,
        `Number: ${number}`,
        `Valid until: ${daysFromNow(c.days).toISOString().slice(0, 10)}`,
        'Generated by the UTSHOB seed script. Not a real licence.',
      ]);
      const file = await File.create({ owner: user._id, filename: `${c.type}.pdf`, mimeType: 'application/pdf', size: pdf.length, data: pdf });
      const reviewed = c.status !== 'pending';
      await Credential.create({
        provider: provider._id,
        type: c.type,
        number,
        issuedAt: daysFromNow(c.days - 730),
        expiresAt: daysFromNow(c.days),
        file: file._id,
        status: c.status,
        reviewedBy: reviewed ? admin._id : undefined,
        reviewedAt: reviewed ? daysFromNow(-30) : undefined,
      });
    }

    if (p.key) result[p.key] = { user, provider };
  }
  return result;
}
