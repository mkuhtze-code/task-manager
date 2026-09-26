import type {
  AccountTier,
  BillingStatus,
  Entitlements,
  ProFeature,
} from './types';

const PRO_TIERS: AccountTier[] = ['premium', 'trusted_tester'];
const ACTIVE_BILLING: BillingStatus[] = ['active', 'trialing'];

/**
 * Derive what the user may do. Prefer server-maintained account_tier;
 * billing_status refines grace for past_due.
 * Single source of truth for Free vs Dokkit (Pro) surfaces.
 */
export function resolveEntitlements(input: {
  accountTier?: string | null;
  billingStatus?: string | null;
}): Entitlements {
  const tier = normalizeTier(input.accountTier);
  const billingStatus = normalizeBillingStatus(input.billingStatus);
  const inBillingGrace = billingStatus === 'past_due';
  const isPro =
    PRO_TIERS.includes(tier) ||
    ACTIVE_BILLING.includes(billingStatus) ||
    inBillingGrace;

  return {
    tier,
    billingStatus,
    isPro,
    canUseJobs: isPro,
    canUseMeetings: isPro,
    canUseTravel: isPro,
    canUseCalendar: isPro,
    canCreateTeam: false,
    inBillingGrace,
  };
}

export function canUseFeature(
  ent: Entitlements,
  feature: ProFeature
): boolean {
  switch (feature) {
    case 'jobs':
      return ent.canUseJobs;
    case 'meetings':
      return ent.canUseMeetings;
    case 'travel':
      return ent.canUseTravel;
    case 'calendar':
      return ent.canUseCalendar;
    default:
      return false;
  }
}

function normalizeTier(raw?: string | null): AccountTier {
  if (raw === 'premium' || raw === 'trusted_tester' || raw === 'free') return raw;
  return 'free';
}

function normalizeBillingStatus(raw?: string | null): BillingStatus {
  const allowed: BillingStatus[] = [
    'none',
    'active',
    'trialing',
    'past_due',
    'canceled',
    'unpaid',
    'incomplete',
    'inactive',
  ];
  if (raw && (allowed as string[]).includes(raw)) return raw as BillingStatus;
  return 'none';
}

/** Map Stripe subscription status → account_tier + billing_status fields. */
export function tierFromStripeStatus(status: string): {
  accountTier: AccountTier;
  billingStatus: BillingStatus;
} {
  switch (status) {
    case 'active':
      return { accountTier: 'premium', billingStatus: 'active' };
    case 'trialing':
      return { accountTier: 'premium', billingStatus: 'trialing' };
    case 'past_due':
      return { accountTier: 'premium', billingStatus: 'past_due' };
    case 'canceled':
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
      return {
        accountTier: 'free',
        billingStatus: status === 'canceled' ? 'canceled' : 'inactive',
      };
    default:
      return { accountTier: 'free', billingStatus: 'none' };
  }
}
