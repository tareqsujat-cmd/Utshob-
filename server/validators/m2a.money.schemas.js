import { z } from 'zod';
import { BUDGET_CATEGORIES, FOOD_UNITS } from '../config/constants.js';

const money = z.coerce.number().int('Use whole taka');

// Expenses
export const expenseSchema = z.object({
  category: z.enum(BUDGET_CATEGORIES, 'Choose a category'),
  description: z.string().trim().min(2, 'Describe the expense').max(120),
  amount: money.min(1, 'Must be at least ৳1'),
  date: z.coerce.date('Choose the date'),
  paidByName: z.string().trim().max(80).default(''),
  paidByGroup: z.string().trim().max(60).default(''),
});

export const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(300) });

// Cost split
export const splitSchema = z
  .object({
    method: z.enum(['equal', 'percentage', 'custom']),
    groups: z
      .array(
        z.object({
          name: z.string().trim().min(1, 'Name the group').max(60),
          percentage: z.coerce.number().min(0).max(100).optional(),
          fixedAmount: money.min(0).optional(),
        })
      )
      .min(1, 'Add at least one group')
      .max(10),
  })
  .refine((d) => new Set(d.groups.map((g) => g.name.toLowerCase())).size === d.groups.length, {
    message: 'Group names must be different',
    path: ['groups'],
  })
  .refine((d) => d.method !== 'percentage' || Math.abs(d.groups.reduce((s, g) => s + (g.percentage || 0), 0) - 100) < 0.01, {
    message: 'Percentages must add up to 100',
    path: ['groups'],
  });

// Contributions
const contributionFields = {
  contributorName: z.string().trim().min(2, 'Enter a name').max(80),
  contributorPhone: z.string().trim().max(20).default(''),
  group: z.string().trim().max(60).default(''),
  amountPledged: money.min(0).default(0),
  inKind: z
    .object({
      description: z.string().trim().max(120).default(''),
      quantity: z.coerce.number().min(0).default(0),
      unit: z.enum([...FOOD_UNITS, 'item']).default('item'),
      estimatedValue: money.min(0).default(0),
    })
    .optional(),
  sponsorship: z
    .object({
      sponsorName: z.string().trim().max(80).default(''),
      offer: z.string().trim().max(200).default(''),
      benefitsPromised: z.string().trim().max(200).default(''),
    })
    .optional(),
};

// Each type needs its own details.
function checkType(d, ctx) {
  if ((d.type === 'cash' || d.type === 'sponsorship') && d.amountPledged < 1) {
    ctx.addIssue({ code: 'custom', path: ['amountPledged'], message: 'Enter the pledged amount' });
  }
  if (d.type === 'in_kind' && (!d.inKind?.description || !(d.inKind.quantity > 0))) {
    ctx.addIssue({ code: 'custom', path: ['inKind', 'description'], message: 'Describe the goods and the quantity' });
  }
  if (d.type === 'sponsorship' && !d.sponsorship?.sponsorName) {
    ctx.addIssue({ code: 'custom', path: ['sponsorship', 'sponsorName'], message: 'Enter the sponsor' });
  }
}

export const contributionSchema = z
  .object({ type: z.enum(['cash', 'in_kind', 'sponsorship']), ...contributionFields })
  .superRefine(checkType);

export const receiveSchema = z.object({
  amount: money.min(1).optional(), // cash / sponsorship
  quantity: z.coerce.number().positive().optional(), // in kind
  note: z.string().trim().max(200).default(''),
});

export const checkoutSchema = z.object({ amount: money.min(10, 'Online payments start at ৳10') });

export const fulfilmentSchema = z.object({
  fulfilmentStatus: z.enum(['not_started', 'in_progress', 'fulfilled']),
  fulfilmentNotes: z.string().trim().max(300).default(''),
});
