import mongoose from 'mongoose';

// Subscription plans (Starter, Plus, Pro, Enterprise). Inserted by the seed script.
// The backend reads limits and feature flags from here, never from hardcoded numbers.
const planSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true }, // starter | plus | pro | enterprise
  name: { type: String, required: true },
  priceUsd: { type: Number, required: true },
  priceBdt: { type: Number, required: true },
  sortOrder: { type: Number, default: 0 },
  limits: {
    activeEvents: Number,
    organizers: Number,
    aiRequestsPerMonth: Number,
    budgetScenarios: Number,
    branches: Number,
  },
  features: {
    customSplits: Boolean,
    sponsorshipOffers: Boolean,
    reminders: Boolean,
    templates: Boolean,
    downloadableReports: Boolean,
    sponsorshipTracking: Boolean,
    assignedApprovers: Boolean,
    detailedReports: Boolean,
    orgSummaries: Boolean,
    teamApprovals: Boolean,
    consolidatedReports: Boolean,
  },
  highlights: [String], // short benefit lines shown on the plans page
});

export const Plan = mongoose.model('Plan', planSchema);
