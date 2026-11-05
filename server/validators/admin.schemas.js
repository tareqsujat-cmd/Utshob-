import { z } from 'zod';

export const approvalDecisionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(300).default(''),
});

export const auditQuerySchema = z.object({
  entityType: z.string().trim().optional(),
  action: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const userListQuerySchema = z.object({
  role: z.string().trim().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

export const settingSchema = z.object({ value: z.boolean() });
