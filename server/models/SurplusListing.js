import mongoose from 'mongoose';
import {
  FOOD_UNITS, DIVISION_NAMES, ALLERGENS, STORAGE_CONDITIONS, PACKAGING_TYPES, LISTING_STATUSES,
} from '../config/constants.js';

// Surplus food offered after (or during) an event, by a host or a food provider.
// Quantities are kept in SEPARATE fields, never one number reused for different meanings:
//   available = quantityTotal - quantityReserved - quantityWastedUnreserved
const surplusListingSchema = new mongoose.Schema(
  {
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    postedByRole: { type: String, enum: ['host', 'provider'], required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' }, // required for hosts
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderProfile' }, // when a provider posts

    foodType: { type: String, required: true, trim: true }, // e.g. "Kacchi biryani"
    description: { type: String, default: '' },
    unit: { type: String, enum: FOOD_UNITS, required: true },
    quantityTotal: { type: Number, required: true, min: 0 },
    quantityReserved: { type: Number, default: 0, min: 0 }, // held by reservations that are not released
    quantityWastedUnreserved: { type: Number, default: 0, min: 0 }, // shortage/disposal before any reservation (M3-F)

    preparation: { preparedAt: Date, method: { type: String, default: '' } },
    packaging: { type: String, enum: PACKAGING_TYPES },
    storageCondition: { type: String, enum: STORAGE_CONDITIONS }, // as REPORTED by the poster
    pickupLocation: {
      address: { type: String, default: '' },
      division: { type: String, enum: DIVISION_NAMES, required: true },
      district: { type: String, required: true },
      lat: Number,
      lng: Number,
    },
    pickupDeadline: { type: Date, required: true },
    ingredients: [String],
    allergens: [{ type: String, enum: ALLERGENS }],
    allergensDeclared: { type: Boolean, default: false }, // true = the poster confirmed the allergen list is complete
    missingInfo: [String], // computed when saved, e.g. ['allergens', 'preparation time']

    status: { type: String, enum: LISTING_STATUSES, default: 'open' },
    cancelReason: { type: String, default: '' },
    // Same food + same pickup place + same day => same key. The unique index refuses a second
    // listing (e.g. host AND caterer posting the same leftovers). Removed when the listing closes.
    dedupeKey: { type: String },
  },
  { timestamps: true }
);

surplusListingSchema.index({ status: 1, 'pickupLocation.division': 1, pickupDeadline: 1 });
surplusListingSchema.index({ postedBy: 1, createdAt: -1 });
surplusListingSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });

export const SurplusListing = mongoose.model('SurplusListing', surplusListingSchema);
