'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ProFeature } from '@/lib/billing';

/**
 * When entitlements have loaded and the user is not allowed on this Pro
 * surface, replace the route with Account → Billing (feature context in query).
 */
export function useProRedirect(
  ready: boolean,
  allowed: boolean,
  feature: ProFeature
): void {
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    if (allowed) return;
    router.replace(`/account/billing?feature=${feature}`);
  }, [ready, allowed, feature, router]);
}
