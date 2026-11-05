import { z } from 'zod';
import { SIGNUP_ROLES, COORDINATOR_ROLES, DIVISIONS, DIVISION_NAMES } from '../config/constants.js';

export const signupSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(80),
    email: z.email('Enter a valid email address'),
    password: z.string().min(8, 'Use at least 8 characters').max(100),
    role: z.enum(SIGNUP_ROLES, 'Choose a role'),
    phone: z.string().trim().max(20).default(''),
    division: z.enum(DIVISION_NAMES, 'Choose a division'),
    district: z.string().trim().min(1, 'Choose a district'),
    // Only for orphanage/outreach coordinators: their organization is created at signup.
    organizationName: z.string().trim().max(120).optional(),
    organizationAddress: z.string().trim().max(200).optional(),
    receivingCapacity: z.coerce.number().int().min(0).optional(),
  })
  .refine((d) => DIVISIONS[d.division]?.includes(d.district), {
    message: 'This district is not in the selected division',
    path: ['district'],
  })
  .refine((d) => !COORDINATOR_ROLES.includes(d.role) || d.organizationName, {
    message: 'Coordinators must enter their organization name',
    path: ['organizationName'],
  });

export const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
