import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  canUseFeature,
  resolveEntitlements,
  type Entitlements,
  type ProFeature,
} from '@/lib/billing';

/**
 * Server-side entitlements from user_settings (service role).
 * Safe default: free if settings missing.
 */
export async function loadEntitlementsForUser(
  userId: string
): Promise<Entitlements> {
  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('account_tier, billing_status')
    .eq('user_id', userId)
    .maybeSingle();

  return resolveEntitlements({
    accountTier: data?.account_tier as string | undefined,
    billingStatus: data?.billing_status as string | undefined,
  });
}

const FEATURE_LABEL: Record<ProFeature, string> = {
  jobs: 'Jobs',
  meetings: 'Meetings',
  travel: 'Travel',
  calendar: 'Calendar',
};

export async function assertCanUseFeature(
  userId: string,
  feature: ProFeature
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const ent = await loadEntitlementsForUser(userId);
  if (!canUseFeature(ent, feature)) {
    return {
      ok: false,
      status: 403,
      error: `${FEATURE_LABEL[feature]} requires a Dokkit plan`,
    };
  }
  return { ok: true };
}

/** @deprecated Prefer assertCanUseFeature(userId, 'meetings') */
export async function assertCanUseMeetings(userId: string) {
  return assertCanUseFeature(userId, 'meetings');
}
