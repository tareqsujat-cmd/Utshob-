import mongoose from 'mongoose';
import { PROVIDER_CATEGORIES, PROVIDER_TAGS, DIVISION_NAMES } from '../config/constants.js';

// A package = something the provider sells, e.g. "Wedding buffet, ৳850 per guest, 100–400 guests".
const packageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  pricingType: { type: String, enum: ['per_guest', 'flat'], required: true },
  price: { type: Number, required: true, min: 0 }, // BDT
  minGuests: { type: Number, default: 1, min: 1 },
  maxGuests: { type: Number, required: true, min: 1 },
  items: [String], // what is included
  isArchived: { type: Boolean, default: false }, // archived packages are hidden, never deleted
});

// One profile per provider account (restaurant, caterer, venue or planner).
const providerProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    businessName: { type: String, required: true, trim: true },
    category: { type: String, enum: PROVIDER_CATEGORIES, required: true },
    description: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    division: { type: String, enum: DIVISION_NAMES, required: true },
    district: { type: String, required: true },
    location: { lat: Number, lng: Number }, // set with the map picker
    serviceAreas: [{ _id: false, division: { type: String, enum: DIVISION_NAMES } }],
    capacity: { min: { type: Number, default: 0 }, max: { type: Number, default: 0 } },
    allowsOutsideCatering: { type: Boolean, default: true }, // venues only
    setupBufferHours: { type: Number, default: 2, min: 0, max: 12 }, // venues: time before an event
    cleanupBufferHours: { type: Number, default: 2, min: 0, max: 12 }, // venues: time after an event
    tags: [{ type: String, enum: PROVIDER_TAGS }],
    packages: [packageSchema],
    blockedDates: [{ date: { type: Date, required: true }, reason: { type: String, default: '' } }],
    // Updated by later features (M3-C bookings and reviews).
    completedBookings: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    ratingAvg: { type: Number, default: 0 },
  },
  { timestamps: true }
);

providerProfileSchema.index({ category: 1, 'serviceAreas.division': 1 });

export const ProviderProfile = mongoose.model('ProviderProfile', providerProfileSchema);
