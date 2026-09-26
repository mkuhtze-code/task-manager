/** Product tiers shown in UI. DB still uses account_tier: free | premium | trusted_tester. */
export type AccountTier = 'trusted_tester' | 'free' | 'premium';

export type BillingStatus =
  | 'none'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'inactive';

/** Pro product surfaces — one source of truth via resolveEntitlements. */
export type ProFeature = 'jobs' | 'meetings' | 'travel' | 'calendar';

export type Entitlements = {
  tier: AccountTier;
  billingStatus: BillingStatus;
  /** Individual paid or trusted tester. */
  isPro: boolean;
  canUseJobs: boolean;
  canUseMeetings: boolean;
  canUseTravel: boolean;
  canUseCalendar: boolean;
  canCreateTeam: boolean;
  /** Soft grace: past_due still treated as pro for a short window. */
  inBillingGrace: boolean;
};

export const PLAN_COPY = {
  free: {
    name: 'Free',
    summary: 'Today, tasks, Reality Check, and core planning.',
  },
  premium: {
    name: 'Dokkit',
    summary: 'Jobs, Meetings, Travel, and calendar integration.',
  },
  trusted_tester: {
    name: 'Trusted tester',
    summary: 'Full access while testing.',
  },
} as const;

export const PRO_FEATURE_COPY: Record<
  ProFeature,
  { title: string; body: string }
> = {
  jobs: {
    title: 'Jobs',
    body: 'Keep work that spans multiple days together. Related tasks share a home so you can see the work as a whole — without turning Dokkit into another project-management system.',
  },
  meetings: {
    title: 'Meetings',
    body: 'Capture what happened while it is still fresh. Connect the moment, time, place, and job so useful information does not disappear into notes.',
  },
  travel: {
    title: 'Travel',
    body: 'Add a trip, block out the days, and Dokkit works out what actually fits around the time away.',
  },
  calendar: {
    title: 'Calendar',
    body: 'Bring external commitments into Today so capacity reflects the day you actually have — read-only, on your terms.',
  },
};
