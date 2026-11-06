import { z } from 'zod';
import {
  DIVISIONS, DIVISION_NAMES, FOOD_UNITS, ALLERGENS, STORAGE_CONDITIONS, PACKAGING_TYPES,
} from '../config/constants.js';
import { objectId } from './m1a.events.schemas.js';

const pickupLocation = z
  .object({
    address: z.string().trim().max(200).default(''),
    division: z.enum(DIVISION_NAMES, 'Choose a division'),
    district: z.string().trim().min(1, 'Choose a district'),
    lat: z.number().min(20).max(27).optional(),
    lng: z.number().min(88).max(93).optional(),
  })
  .refine((l) => DIVISIONS[l.division]?.includes(l.district), {
    message: 'This district is not in the selected division',
    path: ['district'],
  });

// Details the poster may fill in or correct later.
const listingDetails = {
  description: z.string().trim().max(500).default(''),
  preparedAt: z.coerce.date().optional(),
  preparationMethod: z.string().trim().max(120).default(''),
  packaging: z.enum(PACKAGING_TYPES).optional(),
  storageCondition: z.enum(STORAGE_CONDITIONS).optional(),
  ingredients: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  allergens: z.array(z.enum(ALLERGENS)).default([]),
  allergensDeclared: z.boolean().default(false),
};

// POST /api/surplus
export const listingSchema = z
  .object({
    eventId: objectId.optional(), // required for hosts (checked in the controller)
    foodType: z.string().trim().min(2, 'Say what the food is').max(80),
    unit: z.enum(FOOD_UNITS),
    quantityTotal: z.coerce.number().positive('Must be more than 0').max(100000),
    pickupLocation,
    pickupDeadline: z.coerce.date('Choose the pickup deadline'),
    ...listingDetails,
  })
  .refine((d) => d.pickupDeadline > new Date(), { message: 'The deadline must be in the future', path: ['pickupDeadline'] })
  .refine((d) => !d.preparedAt || d.preparedAt <= new Date(), { message: 'Preparation time cannot be in the future', path: ['preparedAt'] });

// PATCH /api/surplus/:id (food type, unit, place and deadline can't change: they define the listing)
export const listingUpdateSchema = z.object({
  quantityTotal: z.coerce.number().positive().max(100000),
  ...listingDetails,
});

export const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(300) });

export const surplusQuerySchema = z.object({
  division: z.enum(DIVISION_NAMES).optional(),
  district: z.string().trim().optional(),
  q: z.string().trim().max(60).optional(),
});

// POST /api/food-requests and PATCH /api/food-requests/:id
export const foodRequestSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the request a short title').max(100),
    notes: z.string().trim().max(500).default(''),
    unit: z.enum(FOOD_UNITS).default('portion'),
    quantityNeeded: z.coerce.number().positive('Must be more than 0').max(10000),
    receivingCapacity: z.coerce.number().positive().max(10000),
    collectionCapacity: z.coerce.number().positive().max(10000),
    availability: z
      .array(z.object({ from: z.coerce.date(), to: z.coerce.date() }).refine((w) => w.to > w.from, { message: 'Window must end after it starts' }))
      .max(10)
      .default([]),
    avoidAllergens: z.array(z.enum(ALLERGENS)).default([]),
  });

// POST /api/reservations
export const reservationSchema = z.object({
  listingId: objectId,
  requestId: objectId,
  quantity: z.coerce.number().positive('Must be more than 0'),
});
