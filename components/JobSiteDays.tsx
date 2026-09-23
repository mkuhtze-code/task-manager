'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { presenceLabel } from '@/lib/travelStopTypes';
import type { JobSiteDayRow } from '@/lib/travelPresence';

/**
 * Lists Travel work stops linked to this job (activities.job_id).
 *
 * Compliance: queries always filter by job_id and rely on RLS user ownership
 * of activities/trips. No cross-tenant access paths. Titles shown only to the
 * owning user in their session.
 */
export default function JobSiteDays(props: { jobId: string; userId: string }) {
  const { jobId, userId } = props;
  const [rows, setRows] = useState<JobSiteDayRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId || !userId) return;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      // Defense in depth: user_id on activities even when RLS also applies.
      const { data: acts, error } = await supabase
        .from('activities')
        .select('id, text, presence, status, trip_day_id, job_id')
        .eq('job_id', jobId)
        .eq('user_id', userId)
        .order('trip_day_id', { ascending: false })
        .limit(40);

      if (cancelled) return;
      if (error || !acts?.length) {
        setRows([]);
        setLoading(false);
        return;
      }

      const dayIds = [...new Set(acts.map((a) => a.trip_day_id).filter(Boolean))];
      const { data: days } = await supabase
        .from('trip_days')
        .select('id, date, trip_id')
        .in('id', dayIds);

      const tripIds = [...new Set((days || []).map((d) => d.trip_id))];
      const { data: trips } = await supabase
        .from('trips')
        .select('id, name')
        .eq('user_id', userId)
        .in('id', tripIds);

      const dayById = new Map((days || []).map((d) => [d.id, d]));
      const tripById = new Map((trips || []).map((t) => [t.id, t]));

      const mapped: JobSiteDayRow[] = [];
      for (const a of acts) {
        const day = dayById.get(a.trip_day_id);
        if (!day) continue;
        const trip = tripById.get(day.trip_id);
        if (!trip) continue;
        mapped.push({
          activityId: a.id,
          tripId: trip.id,
          tripName: trip.name,
          tripDayId: day.id,
          date: day.date,
          stopText: a.text || 'Site',
          presence: a.presence,
          status: a.status || 'pending',
        });
      }

      mapped.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      setRows(mapped);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId, userId]);

  if (loading) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '8px 0' }}>Loading site days…</p>
    );
  }

  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0', lineHeight: 1.4 }}>
        No Travel site stops linked yet. On a trip, add a <strong>Work site</strong> stop and
        link this job.
      </p>
    );
  }

  function fmtDate(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <div className="job-site-days">
      <div className="job-group-label">Site days · {rows.length}</div>
      <ul className="job-site-days-list">
        {rows.map((r) => (
          <li key={r.activityId} className="job-site-day-row">
            <Link href={`/travel/${r.tripId}`} className="job-site-day-link">
              <span className="job-site-day-date mono">{fmtDate(r.date)}</span>
              <span className="job-site-day-body">
                <span className="job-site-day-title">{r.stopText}</span>
                <span className="job-site-day-meta">
                  {r.tripName}
                  {r.presence ? ` · ${presenceLabel(r.presence)}` : ''}
                  {r.status === 'done' ? ' · done' : ''}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
