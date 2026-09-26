import { describe, expect, it } from 'vitest';
import {
  canUseFeature,
  resolveEntitlements,
  tierFromStripeStatus,
} from '../entitlements';

describe('resolveEntitlements', () => {
  it('free cannot use pro surfaces', () => {
    const e = resolveEntitlements({ accountTier: 'free', billingStatus: 'none' });
    expect(e.isPro).toBe(false);
    expect(e.canUseJobs).toBe(false);
    expect(e.canUseMeetings).toBe(false);
    expect(e.canUseTravel).toBe(false);
    expect(e.canUseCalendar).toBe(false);
  });

  it('premium can use all pro surfaces', () => {
    const e = resolveEntitlements({ accountTier: 'premium', billingStatus: 'active' });
    expect(e.isPro).toBe(true);
    expect(e.canUseJobs).toBe(true);
    expect(e.canUseMeetings).toBe(true);
    expect(e.canUseTravel).toBe(true);
    expect(e.canUseCalendar).toBe(true);
  });

  it('trusted tester is pro', () => {
    const e = resolveEntitlements({ accountTier: 'trusted_tester' });
    expect(e.isPro).toBe(true);
    expect(canUseFeature(e, 'jobs')).toBe(true);
  });

  it('past_due keeps pro in grace', () => {
    const e = resolveEntitlements({ accountTier: 'premium', billingStatus: 'past_due' });
    expect(e.inBillingGrace).toBe(true);
    expect(e.canUseMeetings).toBe(true);
  });

  it('canceled free loses pro', () => {
    const e = resolveEntitlements({
      accountTier: tierFromStripeStatus('canceled').accountTier,
      billingStatus: tierFromStripeStatus('canceled').billingStatus,
    });
    expect(e.isPro).toBe(false);
    expect(e.canUseJobs).toBe(false);
  });
});

describe('tierFromStripeStatus', () => {
  it('maps active to premium', () => {
    expect(tierFromStripeStatus('active').accountTier).toBe('premium');
  });
  it('maps canceled to free', () => {
    expect(tierFromStripeStatus('canceled').accountTier).toBe('free');
  });
});
