import { z } from 'zod';
import { DIVISIONS, DIVISION_NAMES, PROVIDER_CATEGORIES, PROVIDER_TAGS } from '../config/constants.js';
import { objectId } from './m1a.events.schemas.js';

// GET /api/geo/search?q=
export const geoSearchSchema = z.object({ q: z.string().trim().min(3, 'Type at least 3 letters').max(120) });

// GET /api/geo/reverse?lat=&lng=   (roughly inside Bangladesh)
export const geoReverseSchema = z.object({
  lat: z.coerce.number().min(20).max(27),
  lng: z.coerce.number().min(88).max(93),
});

// POST /api/providers/search
export const providerSearchSchema = z.object({
  location: z
    .object({
      division: z.enum(DIVISION_NAMES, 'Choose a division'),
      district: z.string().trim().min(1, 'Choose a district'),
      lat: z.number().min(20).max(27).optional(),
      lng: z.number().min(88).max(93).optional(),
    })
    .refine((l) => DIVISIONS[l.division]?.includes(l.district), { message: 'This district is not in the selected division', path: ['district'] }),
  date: z.coerce.date().optional(),
  guestCount: z.coerce.number().int().min(1, 'At least 1 guest').max(5000),
  categories: z.array(z.enum(PROVIDER_CATEGORIES)).min(1, 'Choose at least one kind of provider'),
  budgets: z.partialRecord(z.enum(PROVIDER_CATEGORIES), z.coerce.number().min(0)).default({}), // per category, BDT
  services: z.array(z.enum(PROVIDER_TAGS)).default([]), // must have
  preferences: z.array(z.enum(PROVIDER_TAGS)).default([]), // nice to have
  venueId: objectId.optional(), // the venue already chosen (outside-catering check)
});
