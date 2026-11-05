import { z } from 'zod';
import { DIVISIONS, DIVISION_NAMES } from '../config/constants.js';

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(80),
    phone: z.string().trim().max(20).default(''),
    division: z.enum(DIVISION_NAMES, 'Choose a division'),
    district: z.string().trim().min(1, 'Choose a district'),
  })
  .refine((d) => DIVISIONS[d.division]?.includes(d.district), {
    message: 'This district is not in the selected division',
    path: ['district'],
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(8, 'Use at least 8 characters').max(100),
});

export const updateOrganizationSchema = z.object({
  address: z.string().trim().max(200).default(''),
  contactPhone: z.string().trim().max(20).default(''),
  defaultReceivingCapacity: z.coerce.number().int().min(0),
});
