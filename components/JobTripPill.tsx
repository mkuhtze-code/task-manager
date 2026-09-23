'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import {
  dayIndexOnTrip,
  daysBetweenInclusive,
  localDateStr,
  type ActiveTripSummary,
} from '@/lib/travelContext';
import PillReveal from '@/components/PillReveal';

/**
 * Soft Travel ↔ Jobs link: while the user is on a trip, surface it on the job
 * so site work and travel context stay connected without a formal job↔trip FK.
 */
export default function JobTripPill(props: { userId: string }) {
  const { userId } = props;
  const [trip, setTrip] = useState<ActiveTripSummary | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [totalDays, setTotalDays] = useState(0);
  const [stopCount, setStopCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const todayStr = localDateStr();
    void (async () => {
      const { data } = await supabase
        .from('trips')
        .select('id, name, start_date, end_date')
        .eq('user_id', userId)
        .lte('start_date', todayStr)
        .gte('end_date', todayStr)
        .order('start_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!data) {
        setTrip(null);
        return;
      }

      const t = data as ActiveTripSummary;
      setTrip(t);
      setDayIndex(dayIndexOnTrip(t.start_date, todayStr));
      setTotalDays(daysBetweenInclusive(t.start_date, t.end_date));

      const { data: dayRow } = await supabase
        .from('trip_days')
        .select('id')
        .eq('trip_id', t.id)
        .eq('date', todayStr)
        .maybeSingle();

      if (dayRow?.id) {
        const { count } = await supabase
          .from('activities')
          .select('id', { count: 'exact', head: true })
          .eq('trip_day_id', dayRow.id)
          .neq('status', 'done');
        setStopCount(count ?? 0);
      } else {
        setStopCount(0);
      }
    })();
  }, [userId]);

  if (!trip) return null;

  return (
    <PillReveal label="Travel" count={stopCount || undefined} align="end">
      <div className="job-meetings-popover">
        <p className="job-meetings-popover-empty" style={{ marginBottom: 8 }}>
          You're on <strong>{trip.name}</strong> — Day {dayIndex} of {totalDays}
          {stopCount > 0 ? ` · ${stopCount} stop${stopCount === 1 ? '' : 's'} today` : ''}.
        </p>
        <Link
          href={`/travel/${trip.id}`}
          className="task-conn-node task-conn-node-meeting"
          style={{ textDecoration: 'none' }}
        >
          <span className="task-conn-kind">Trip</span>
          <span className="task-conn-title">{trip.name}</span>
          <span className="task-conn-meta mono">Open itinerary →</span>
        </Link>
      </div>
    </PillReveal>
  );
}
