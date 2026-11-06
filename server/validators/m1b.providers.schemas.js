import { z } from 'zod';
import {
  DIVISIONS,
  DIVISION_NAMES,
  PROVIDER_CATEGORIES,
  PROVIDER_TAGS,
  CREDENTIAL_TYPES,
} from '../config/constants.js';

// PUT /api/providers/me
export const profileSchema = z
  .object({
    businessName: z.string().trim().min(2, 'Business name is too short').max(100),
    category: z.enum(PROVIDER_CATEGORIES, 'Choose a category'),
    description: z.string().trim().max(1000).default(''),
    phone: z.string().trim().max(20).default(''),
    address: z.string().trim().max(200).default(''),
    division: z.enum(DIVISION_NAMES, 'Choose a division'),
    district: z.string().trim().min(1, 'Choose a district'),
    // Roughly the borders of Bangladesh, so a wrong click far away is rejected.
    location: z.object({ lat: z.number().min(20).max(27), lng: z.number().min(88).max(93) }).nullable().default(null),
    serviceAreas: z.array(z.enum(DIVISION_NAMES)).min(1, 'Choose at least one division you serve'),
    capacity: z
      .object({ min: z.coerce.number().int().min(0), max: z.coerce.number().int().min(0) })
      .default({ min: 0, max: 0 }),
    allowsOutsideCatering: z.boolean().default(true),
    setupBufferHours: z.coerce.number().int().min(0).max(12).default(2),
    cleanupBufferHours: z.coerce.number().int().min(0).max(12).default(2),
    tags: z.array(z.enum(PROVIDER_TAGS)).default([]),
  })
  .refine((d) => DIVISIONS[d.division]?.includes(d.district), {
    message: 'This district is not in the selected division',
    path: ['district'],
  })
  .refine((d) => d.capacity.max === 0 || d.capacity.max >= d.capacity.min, {
    message: 'Maximum must be at least the minimum',
    path: ['capacity.max'],
  })
  .refine((d) => d.category !== 'venue' || d.capacity.max > 0, {
    message: 'Venues must give a maximum guest capacity',
    path: ['capacity.max'],
  });

// POST /api/providers/me/packages and PATCH /api/providers/me/packages/:packageId
export const packageSchema = z
  .object({
    name: z.string().trim().min(2, 'Package name is too short').max(100),
    description: z.string().trim().max(500).default(''),
    pricingType: z.enum(['per_guest', 'flat']),
    price: z.coerce.number().int('Use whole taka').min(0),
    minGuests: z.coerce.number().int().min(1).default(1),
    maxGuests: z.coerce.number().int().min(1),
    items: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
    isArchived: z.boolean().default(false),
  })
  .refine((d) => d.maxGuests >= d.minGuests, {
    message: 'Maximum guests must be at least the minimum',
    path: ['maxGuests'],
  });

// PUT /api/providers/me/blocked-dates
export const blockedDatesSchema = z.object({
  blockedDates: z
    .array(z.object({ date: z.coerce.date(), reason: z.string().trim().max(100).default('') }))
    .max(200),
});

// POST /api/providers/me/credentials (multipart form: every field arrives as text)
export const credentialSchema = z
  .object({
    type: z.enum(CREDENTIAL_TYPES, 'Choose a document type'),
    number: z.string().trim().min(2, 'Enter the licence / certificate number').max(60),
    issuedAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date('Enter the expiry date'),
  })
  .refine((d) => !d.issuedAt || d.expiresAt > d.issuedAt, {
    message: 'Expiry date must be after the issue date',
    path: ['expiresAt'],
  });

// PATCH /api/admin/credentials/:id
export const credentialReviewSchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    note: z.string().trim().max(300).default(''),
  })
  .refine((d) => d.status === 'approved' || d.note, {
    message: 'Please give a reason when rejecting',
    path: ['note'],
  });

// GET /api/admin/credentials?status=
export const credentialQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
});

// GET /api/providers?category=&division=&q=
export const directoryQuerySchema = z.object({
  category: z.enum(PROVIDER_CATEGORIES).optional(),
  division: z.enum(DIVISION_NAMES).optional(),
  q: z.string().trim().max(60).optional(),
});
