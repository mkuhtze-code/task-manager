'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  resolveEntitlements,
  type Entitlements,
} from '@/lib/billing';

const FALLBACK = resolveEntitlements({ accountTier: 'free', billingStatus: 'none' });

/**
 * Loads account_tier + billing_status and derives product entitlements.
 * Pass userId when known; omit to resolve from the current session.
 * Until loaded, treats as free (safe default).
 */
export function useEntitlements(userId?: string | null): {
  entitlements: Entitlements;
  loading: boolean;
} {
  const [entitlements, setEntitlements] = useState<Entitlements>(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let uid = userId;
      if (uid === undefined) {
        const { data } = await supabase.auth.getSession();
        uid = data.session?.user?.id ?? null;
      }

      if (!uid) {
        if (!cancelled) {
          setEntitlements(FALLBACK);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) setLoading(true);

      const { data } = await supabase
        .from('user_settings')
        .select('account_tier, billing_status')
        .eq('user_id', uid)
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
