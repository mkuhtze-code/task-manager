'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { fmtMeetingWindow } from '@/lib/meetingUtils';

type DayMeeting = {
  id: string;
  text: string;
  start_time: string | null;
  duration_mins: number;
  job_id: string | null;
};

/**
 * Meetings that fall on this trip day — closes Travel ↔ Meetings graph.
 *
 * Compliance: always filters by user_id; only shows the authenticated
 * user's meetings. No cross-tenant data paths.
 */
export default function TripDayMeetings(props: {
  userId: string;
  /** YYYY-MM-DD local trip day */
  dateStr: string;
}) {
  const { userId, dateStr } = props;
  const [rows, setRows] = useState<DayMeeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !dateStr) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    void (async () => {
      setLoading(true);
      // Range for the local calendar day in UTC-safe string bounds.
      // Meetings store start_time as timestamptz; filter by date prefix via range.
      const dayStart = `${dateStr}T00:00:00`;
      const dayEnd = `${dateStr}T23:59:59.999`;

      const { data, error } = await supabase
        .from('meetings')
        .select('id, text, start_time, duration_mins, job_id')
        .eq('user_id', userId)
        .gte('start_time', dayStart)
        .lte('start_time', dayEnd)
        .order('start_time', { ascending: true })
        .limit(20);

      if (cancelled) return;
      if (error) {
        setRows([]);
        setLoading(false);
        return;
      }
      setRows((data as DayMeeting[]) || []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, dateStr]);

  if (loading || rows.length === 0) return null;

  return (
    <div className="trip-day-meetings">
      <div className="job-group-label">Meetings · {rows.length}</div>
      <ul className="trip-day-meetings-list">
        {rows.map((m) => (
          <li key={m.id}>
            <Link href={`/meetings/${m.id}`} className="trip-day-meeting-link">
              <span className="trip-day-meeting-title">{m.text}</span>
              <span className="trip-day-meeting-meta mono">
                {fmtMeetingWindow(m.start_time, m.duration_mins)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
