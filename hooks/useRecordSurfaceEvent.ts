// hooks/useRecordSurfaceEvent.ts
//
// Lightweight hook for recording surface navigation events to Supabase.
// Used by the primary surfaces (Today, Jobs, Travel) to feed Personal
// Gravity (Scope 3G) with evidence of which surface the user chose.

import { useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Surface } from '@/lib/thinking/types';

export function useRecordSurfaceEvent() {
  const record = useCallback(async (surface: Surface, active: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('surface_events').insert({
      user_id: user.id,
      surface,
      active,
    });
  }, []);

  return record;
}
