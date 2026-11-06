import { z } from 'zod';
import {
  DIVISIONS, DIVISION_NAMES, EVENT_TYPES, EVENT_STATUSES, REQUIRED_SERVICES, FOOD_UNITS, MENU_COURSES,
  DIETARY_LABELS, BUDGET_CATEGORIES, INVITATION_PALETTES, INVITATION_FONTS, INVITATION_LAYOUTS,
} from '../config/constants.js';

export const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid id');

const location = z
  .object({
    division: z.enum(DIVISION_NAMES, 'Choose a division'),
    district: z.string().trim().min(1, 'Choose a district'),
    address: z.string().trim().max(200).default(''),
    lat: z.number().min(20).max(27).optional(),
    lng: z.number().min(88).max(93).optional(),
  })
  .refine((l) => DIVISIONS[l.division]?.includes(l.district), {
    message: 'This district is not in the selected division',
    path: ['district'],
  });

const dietary = z
  .array(z.object({ label: z.enum(Object.keys(DIETARY_LABELS)), guestCount: z.coerce.number().int().min(0) }))
  .max(10)
  .default([]);

const menuItem = z.object({
  _id: objectId.optional(), // present when editing an existing dish (keeps its batches linked)
  name: z.string().trim().min(2, 'Dish name is too short').max(80),
  course: z.enum(MENU_COURSES).default('main'),
  unit: z.enum(FOOD_UNITS),
  quantityPerGuest: z.coerce.number().positive('Must be more than 0'),
  portionsPerUnit: z.coerce.number().positive().default(1),
});

// Fields shared by create and edit.
const eventFields = {
  title: z.string().trim().min(3, 'Title is too short').max(100),
  eventType: z.enum(EVENT_TYPES, 'Choose an event type'),
  location,
  guestCount: z.coerce.number().int().min(1, 'At least 1 guest').max(5000),
  budgetTotal: z.coerce.number().int('Use whole taka').min(0),
  dietary,
  requiredServices: z.array(z.enum(REQUIRED_SERVICES)).default([]),
  notes: z.string().trim().max(1000).default(''),
};

const endsAfterStart = [(d) => d.endsAt > d.startsAt, { message: 'End must be after the start', path: ['endsAt'] }];

// POST /api/events
export const createEventSchema = z
  .object({
    ...eventFields,
    startsAt: z.coerce.date('Choose the start'),
    endsAt: z.coerce.date('Choose the end'),
    status: z.enum(['draft', 'planned']).default('planned'),
  })
  .refine(...endsAfterStart)
  .refine((d) => d.startsAt > new Date(), { message: 'The event must be in the future', path: ['startsAt'] });

// PATCH /api/events/:id (dates change through /reschedule instead, so the right people are notified)
export const updateEventSchema = z.object({ ...eventFields, reason: z.string().trim().max(300).default('') });

export const rescheduleSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z.string().trim().min(3, 'Please give a reason').max(300),
  })
  .refine(...endsAfterStart)
  .refine((d) => d.startsAt > new Date(), { message: 'The new date must be in the future', path: ['startsAt'] });

export const cancelSchema = z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(300) });

export const copySchema = z
  .object({
    title: z.string().trim().min(3).max(100).optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine(...endsAfterStart)
  .refine((d) => d.startsAt > new Date(), { message: 'The new event must be in the future', path: ['startsAt'] });

export const organizersSchema = z.object({ emails: z.array(z.email('Enter valid email addresses')).max(20) });

export const eventListQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// Budget
export const budgetLinesSchema = z.object({
  lines: z
    .array(
      z.object({
        category: z.enum(BUDGET_CATEGORIES),
        estimated: z.coerce.number().int('Use whole taka').min(0),
        note: z.string().trim().max(120).default(''),
      })
    )
    .max(BUDGET_CATEGORIES.length),
  reason: z.string().trim().min(3, 'Say why the budget changed').max(300),
  version: z.coerce.number().int().min(1), // the version the user was looking at
});

export const newScenarioSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(40),
  copyFrom: objectId.optional(),
});

// Invitation and RSVP
export const invitationSchema = z.object({
  heading: z.string().trim().max(120).default(''),
  message: z.string().trim().max(1000).default(''),
  theme: z.object({
    palette: z.enum(INVITATION_PALETTES),
    font: z.enum(INVITATION_FONTS),
    layout: z.enum(INVITATION_LAYOUTS),
  }),
  rsvpDeadline: z.coerce.date().nullable().default(null),
  isPublished: z.boolean().default(false),
});

// "+880 1711-000001" or "01711000001" -> "01711000001"
export function normalizePhone(value) {
  const digits = String(value).replace(/\D/g, '');
  return digits.startsWith('880') ? `0${digits.slice(3)}` : digits;
}

export const rsvpSchema = z.object({
  guestName: z.string().trim().min(2, 'Enter your name').max(80),
  phone: z
    .string()
    .transform(normalizePhone)
    .refine((p) => /^01[3-9]\d{8}$/.test(p), 'Enter a Bangladeshi mobile number, e.g. 01711000000'),
  response: z.enum(['yes', 'no', 'maybe'], 'Choose your answer'),
  partySize: z.coerce.number().int().min(1).max(20).default(1),
  dietaryNotes: z.string().trim().max(200).default(''),
});

// Food plan
export const menuSchema = z.object({
  menu: z.array(menuItem).max(40),
  reason: z.string().trim().max(300).default(''),
});

export const foodPlanQuerySchema = z.object({ attendance: z.coerce.number().int().min(0).max(5000).optional() });

export const batchSchema = z.object({
  menuItemId: objectId,
  quantity: z.coerce.number().positive('Must be more than 0'),
  note: z.string().trim().max(120).default(''),
});

export const batchStatusSchema = z.object({ status: z.enum(['started', 'completed', 'cancelled']) });

export const suggestSchema = z.object({ attendance: z.coerce.number().int().min(0).max(5000) });

export const applySchema = z.object({
  attendance: z.coerce.number().int().min(0).max(5000),
  reason: z.string().trim().max(300).default(''),
  adjustments: z
    .array(
      // discriminatedUnion: zod picks the right shape by looking at `type`
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('update'), batchId: objectId, from: z.number().min(0), to: z.number().min(0) }),
        z.object({ type: z.literal('cancel'), batchId: objectId, from: z.number().min(0) }),
        z.object({ type: z.literal('add'), menuItemId: objectId, quantity: z.number().positive() }),
      ])
    )
    .min(1, 'Nothing to apply')
    .max(100),
});
