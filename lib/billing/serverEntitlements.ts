import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveEntitlements, type Entitlements } from '@/lib/billing';

/**
 * Server-side entitlements from user_settings (service role).
 * Safe default: free / no meetings if settings missing.
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

export async function assertCanUseMeetings(
  userId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const ent = await loadEntitlementsForUser(userId);
  if (!ent.canUseMeetings) {
    return {
      ok: false,
      status: 403,
      error: 'Meetings requires a Dokkit plan',
    };
  }
  return { ok: true };
}

