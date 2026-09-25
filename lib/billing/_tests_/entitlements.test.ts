import { describe, expect, it } from 'vitest';
import { resolveEntitlements, tierFromStripeStatus } from '../entitlements';

describe('resolveEntitlements', () => {
  it('free cannot use meetings', () => {
    const e = resolveEntitlements({ accountTier: 'free', billingStatus: 'none' });
    expect(e.canUseMeetings).toBe(false);
    expect(e.isPro).toBe(false);
  });

  it('premium can use meetings', () => {
    const e = resolveEntitlements({ accountTier: 'premium', billingStatus: 'active' });
    expect(e.canUseMeetings).toBe(true);
  });

  it('trusted tester is pro', () => {
    const e = resolveEntitlements({ accountTier: 'trusted_tester' });
    expect(e.isPro).toBe(true);
    expect(e.canUseMeetings).toBe(true);
  });

  it('past_due keeps meetings in grace', () => {
    const e = resolveEntitlements({ accountTier: 'premium', billingStatus: 'past_due' });
    expect(e.inBillingGrace).toBe(true);
    expect(e.canUseMeetings).toBe(true);
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

