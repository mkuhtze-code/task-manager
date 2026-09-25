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

export type Entitlements = {
  tier: AccountTier;
  billingStatus: BillingStatus;
  /** Individual paid or trusted tester — Meetings, full product surfaces. */
  isPro: boolean;
  canUseMeetings: boolean;
  canCreateTeam: boolean;
  /** Soft grace: past_due still treated as pro for a short window. */
  inBillingGrace: boolean;
};

export const PLAN_COPY = {
  free: {
    name: 'Free',
    summary: 'Today, Jobs, Travel, and personal planning.',
  },
  premium: {
    name: 'Dokkit',
    summary: 'Everything in Free, plus Meetings and higher collaboration limits.',
  },
  trusted_tester: {
    name: 'Trusted tester',
    summary: 'Full access while testing.',
  },
} as const;
