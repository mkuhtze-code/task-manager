'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
  dayIndexOnTrip,
  daysBetweenInclusive,
  localDateStr,
  type ActiveTripSummary,
} from '@/lib/travelContext';

function fmtEndDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

type BannerState = {
  trip: ActiveTripSummary;
  dayIndex: number;
  totalDays: number;
  stopCount: number;
  stopLabels: string[];
};

/**
 * Surfaces the active trip on Today without leaving the day.
 * Standalone Travel still owns the itinerary; this is awareness + a fast path in.
 */
export default function TravelAwarenessBanner({ userId }: { userId?: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<BannerState | null>(null);

  useEffect(() => {
    if (userId) {
      void load(userId);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void load(data.session.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function load(uid: string) {
    const todayStr = localDateStr(new Date());
    const { data: trip } = await supabase
      .from('trips')
      .select('id, name, start_date, end_date')
      .eq('user_id', uid)
      .lte('start_date', todayStr)
      .gte('end_date', todayStr)
      .order('start_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!trip) {
      setState(null);
      return;
    }

    const { data: dayRow } = await supabase
      .from('trip_days')
      .select('id, date')
      .eq('trip_id', trip.id)
      .eq('date', todayStr)
      .maybeSingle();

    let stopCount = 0;
    let stopLabels: string[] = [];
    if (dayRow?.id) {
      const { data: acts } = await supabase
        .from('activities')
        .select('text, status')
        .eq('trip_day_id', dayRow.id)
        .neq('status', 'done')
        .order('order_index', { ascending: true })
        .limit(6);
      const list = acts || [];
      stopCount = list.length;
      stopLabels = list.map((a) => a.text).filter(Boolean);
    }

    setState({
      trip: trip as ActiveTripSummary,
      dayIndex: dayIndexOnTrip(trip.start_date, todayStr),
      totalDays: daysBetweenInclusive(trip.start_date, trip.end_date),
      stopCount,
      stopLabels,
    });
  }

  if (!state) return null;

  const { trip, dayIndex, totalDays, stopCount, stopLabels } = state;
  const stopsLine =
    stopCount === 0
      ? 'Nothing planned for today yet'
      : stopCount === 1
        ? stopLabels[0]
        : `${stopLabels[0]}${stopLabels[1] ? ` · ${stopLabels[1]}` : ''}${stopCount > 2 ? ` +${stopCount - 2}` : ''}`;

  return (
    <button
      type="button"
      className="travel-aware-banner"
      onClick={() => router.push(`/travel/${trip.id}`)}
    >
      <span className="travel-aware-banner-top">
        <span className="header-active-dot" />
        <span className="travel-aware-banner-title">
          {trip.name}
          <span className="travel-aware-banner-meta">
            {' '}
            · Day {dayIndex} of {totalDays}
            {stopCount > 0 ? ` · ${stopCount} stop${stopCount === 1 ? '' : 's'}` : ''}
          </span>
        </span>
        <span className="travel-aware-banner-chev" aria-hidden="true">
          →
        </span>
      </span>
      <span className="travel-aware-banner-sub">
        {stopsLine}
        <span className="travel-aware-banner-until"> · back {fmtEndDate(trip.end_date)}</span>
      </span>
    </button>
  );
}
