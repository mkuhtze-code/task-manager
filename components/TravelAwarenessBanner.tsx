'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type ActiveTrip = { id: string; name: string; end_date: string };

function fmtEndDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short' });
}

// Deliberately its own self-contained fetch, not wired into Today's
// existing loadEverything() — keeps this addition isolated from the
// production data-loading path rather than tangling a new query into
// an already-working function.
export default function TravelAwarenessBanner() {
  const router = useRouter();
  const [trip, setTrip] = useState<ActiveTrip | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('trips')
      .select('id, name, end_date')
      .eq('user_id', session.user.id)
      .lte('start_date', todayStr)
      .gte('end_date', todayStr)
      .limit(1)
      .maybeSingle();

    setTrip(data);
  }

  if (!trip) return null;

  return (
    <div
      className="header-active-strip"
      style={{ marginBottom: 'var(--space-3)' }}
      onClick={() => router.push(`/travel/${trip.id}`)}
    >
      <span className="header-active-dot" />
      <span className="header-active-text">
        Away in {trip.name} — back {fmtEndDate(trip.end_date)} →
      </span>
    </div>
  );
}
