'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { dateStrFromIso, type ActiveTripSummary } from '@/lib/travelContext';
import PillReveal from '@/components/PillReveal';

/**
 * If this meeting falls inside a planned trip, surface the link so the user
 * does not have to reconstruct "I'm away that week" from memory.
 */
export default function MeetingTripPill(props: {
  userId: string;
  meetingStartIso: string | null;
}) {
  const { userId, meetingStartIso } = props;
  const [trip, setTrip] = useState<ActiveTripSummary | null>(null);

  useEffect(() => {
    const day = dateStrFromIso(meetingStartIso);
    if (!day || !userId) {
      setTrip(null);
      return;
    }

    void (async () => {
      const { data } = await supabase
        .from('trips')
        .select('id, name, start_date, end_date')
        .eq('user_id', userId)
        .lte('start_date', day)
        .gte('end_date', day)
        .order('start_date', { ascending: true })
        .limit(1)
        .maybeSingle();
      setTrip((data as ActiveTripSummary) || null);
    })();
  }, [userId, meetingStartIso]);

  if (!trip) return null;

  return (
    <PillReveal label="On this trip" align="start">
      <div className="job-meetings-popover">
        <p className="job-meetings-popover-empty" style={{ marginBottom: 8 }}>
          This meeting falls during <strong>{trip.name}</strong> (
          {trip.start_date} – {trip.end_date}).
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
