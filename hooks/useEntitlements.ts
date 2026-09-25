'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  resolveEntitlements,
  type Entitlements,
} from '@/lib/billing';

const FALLBACK = resolveEntitlements({ accountTier: 'free', billingStatus: 'none' });

/**
 * Loads account_tier + billing_status for the signed-in user and derives
 * product entitlements. Until loaded, treats as free (safe default).
 */
export function useEntitlements(userId: string | null | undefined): {
  entitlements: Entitlements;
  loading: boolean;
} {
  const [entitlements, setEntitlements] = useState<Entitlements>(FALLBACK);
  const [loading, setLoading] = useState(Boolean(userId));

  useEffect(() => {
    if (!userId) {
      setEntitlements(FALLBACK);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data } = await supabase
        .from('user_settings')
        .select('account_tier, billing_status')
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled) return;

      setEntitlements(
        resolveEntitlements({
          accountTier: data?.account_tier as string | undefined,
          billingStatus: data?.billing_status as string | undefined,
        })
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { entitlements, loading };
}
