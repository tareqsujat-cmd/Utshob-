// The four subscription plans (assignment benefits table; Decisions in CLAUDE.md).
// BDT price = USD price x 120 (fixed demo rate).
const noFeatures = {
  customSplits: false,
  sponsorshipOffers: false,
  reminders: false,
  templates: false,
  downloadableReports: false,
  sponsorshipTracking: false,
  assignedApprovers: false,
  detailedReports: false,
  orgSummaries: false,
  teamApprovals: false,
  consolidatedReports: false,
};

const plusFeatures = {
  ...noFeatures,
  customSplits: true,
  sponsorshipOffers: true,
  reminders: true,
  templates: true,
  downloadableReports: true,
};

const proFeatures = { ...plusFeatures, sponsorshipTracking: true, assignedApprovers: true, detailedReports: true };

const enterpriseFeatures = { ...proFeatures, orgSummaries: true, teamApprovals: true, consolidatedReports: true };

export const PLANS = [
  {
    code: 'starter',
    name: 'Starter',
    priceUsd: 0,
    priceBdt: 0,
    sortOrder: 1,
    limits: { activeEvents: 1, organizers: 1, aiRequestsPerMonth: 10, budgetScenarios: 1, branches: 0 },
    features: noFeatures,
    highlights: ['1 active event', '1 organizer', '10 AI requests / month', 'Equal expense splitting',
      'Basic contribution records', 'On-screen reports'],
  },
  {
    code: 'plus',
    name: 'Plus',
    priceUsd: 15,
    priceBdt: 1800,
    sortOrder: 2,
    limits: { activeEvents: 3, organizers: 3, aiRequestsPerMonth: 30, budgetScenarios: 2, branches: 0 },
    features: plusFeatures,
    highlights: ['3 active events', '3 organizers', '30 AI requests / month', 'Custom & percentage splits',
      'Sponsorship offers', 'Reminders', '2 budget scenarios per event', 'Reusable templates', 'Downloadable reports'],
  },
  {
    code: 'pro',
    name: 'Pro',
    priceUsd: 25,
    priceBdt: 3000,
    sortOrder: 3,
    limits: { activeEvents: 5, organizers: 5, aiRequestsPerMonth: 60, budgetScenarios: 5, branches: 0 },
    features: proFeatures,
    highlights: ['5 active events', '5 organizers', '60 AI requests / month', 'Sponsorship fulfilment tracking',
      'Assigned approvers', '5 budget scenarios per event', 'Detailed finance & impact reports'],
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    priceUsd: 45,
    priceBdt: 5400,
    sortOrder: 4,
    limits: { activeEvents: 10, organizers: 10, aiRequestsPerMonth: 100, budgetScenarios: 10, branches: 3 },
    features: enterpriseFeatures,
    highlights: ['10 active events', '10 organizers', '100 AI requests / month', 'Organization-wide summaries',
      '10 budget scenarios per event', 'Up to 3 branches', 'Team approvals', 'Consolidated reports'],
  },
];
