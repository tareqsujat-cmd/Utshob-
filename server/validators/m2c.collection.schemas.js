import { z } from 'zod';
import { objectId } from './m1a.events.schemas.js';

// POST /api/reservations/:id/tasks
export const assignSchema = z
  .object({
    collectorType: z.enum(['volunteer', 'org_arranged']),
    volunteerId: objectId.optional(), // when a volunteer account collects
    collectorName: z.string().trim().max(80).default(''), // when the organization arranges someone itself
    collectorPhone: z.string().trim().max(20).default(''),
    scheduledAt: z.coerce.date('Choose the pickup time'),
  })
  .refine((d) => d.collectorType !== 'volunteer' || d.volunteerId, { message: 'Choose a volunteer', path: ['volunteerId'] })
  .refine((d) => d.collectorType !== 'org_arranged' || d.collectorName.length >= 2, { message: "Enter the collector's name", path: ['collectorName'] });

// PATCH /api/tasks/:id/status
export const taskStatusSchema = z
  .object({
    status: z.enum(['en_route', 'delayed', 'collected', 'partially_collected', 'cancelled', 'missed']),
    quantityCollected: z.coerce.number().min(0).optional(),
    delayMinutes: z.coerce.number().int().min(1).max(600).optional(),
    reason: z.string().trim().max(300).default(''),
  })
  .refine((d) => !['collected', 'partially_collected'].includes(d.status) || d.quantityCollected !== undefined, {
    message: 'Enter the quantity collected', path: ['quantityCollected'],
  })
  .refine((d) => d.status !== 'delayed' || d.delayMinutes, { message: 'How many minutes late?', path: ['delayMinutes'] })
  .refine((d) => !['cancelled', 'missed', 'delayed'].includes(d.status) || d.reason.length >= 3, { message: 'Please give a reason', path: ['reason'] });

export const volunteerQuerySchema = z.object({ division: z.string().trim().optional() });
