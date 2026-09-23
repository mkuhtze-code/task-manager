'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CloseIcon } from '@/components/icons';
import { useDialogA11y } from '@/hooks/useDialogA11y';

function fmtMins(mins: number): string {
  mins = Math.round(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtDayLabel(dateStr: string): { weekday: string; date: string; dayNum: string } {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  return {
    weekday: dt.toLocaleDateString(undefined, { weekday: 'short' }),
    date: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    dayNum: String(d),
  };
}

function timeStringToMinutes(t: string): number {
  const [h, m] = t.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

type TripDay = {
  id: string;
  date: string;
  day_start: string;
  day_end: string;
  arrival_time: string | null;
  departure_time: string | null;
  drive_from_base_mins: number | null;
};

type DaySummary = {
  stopCount: number;
  plannedMins: number;
  capacityMins: number;
  overloaded: boolean;
  spareMins: number;
};

type Props = {
  tripName: string;
  tripDays: TripDay[];
  selectedDayId: string | null;
  todayStr: string;
  nowMinutesOfDay: number;
  onSelectDay: (id: string) => void;
  onClose: () => void;
};

export default function TripOverviewSheet({
  tripName,
  tripDays,
  selectedDayId,
  todayStr,
  nowMinutesOfDay,
  onSelectDay,
  onClose,
}: Props) {
  const [summaries, setSummaries] = useState<Record<string, DaySummary>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (tripDays.length === 0) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const ids = tripDays.map((d) => d.id);
      const { data } = await supabase
        .from('activities')
        .select('trip_day_id, estimate_mins, drive_mins_to_next')
        .in('trip_day_id', ids)
        .neq('status', 'done');

      if (cancelled) return;

      const byDay: Record<string, { stopCount: number; plannedMins: number }> = {};
      for (const id of ids) byDay[id] = { stopCount: 0, plannedMins: 0 };
      for (const row of data || []) {
        const bucket = byDay[row.trip_day_id];
        if (!bucket) continue;
        bucket.stopCount += 1;
        bucket.plannedMins += (row.estimate_mins || 0) + (row.drive_mins_to_next || 0);
      }

      const next: Record<string, DaySummary> = {};
      for (const day of tripDays) {
        const bucket = byDay[day.id] || { stopCount: 0, plannedMins: 0 };
        const start = timeStringToMinutes(day.arrival_time || day.day_start || '08:00');
        const end = timeStringToMinutes(day.departure_time || day.day_end || '20:00');
        const isToday = day.date === todayStr;
        const capacityMins = isToday
          ? Math.max(end - nowMinutesOfDay, 0)
          : Math.max(end - start, 0);
        const plannedMins = (day.drive_from_base_mins || 0) + bucket.plannedMins;
        const spareMins = capacityMins - plannedMins;
        next[day.id] = {
          stopCount: bucket.stopCount,
          plannedMins,
          capacityMins,
          overloaded: capacityMins > 0 && plannedMins > capacityMins,
          spareMins,
        };
      }
      setSummaries(next);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tripDays, todayStr, nowMinutesOfDay]);

  function pick(id: string) {
    onSelectDay(id);
    onClose();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="capture-sheet task-detail-sheet trip-overview-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Trip overview"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="task-detail-header">
          <div className="settings-panel-title">
            {tripName}
            <span className="day-sheet-day-pos"> · {tripDays.length} day{tripDays.length === 1 ? '' : 's'}</span>
          </div>
          <button className="gear-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <p className="trip-overview-lead">Jump to any day. Tap a card to open it.</p>

        <div className="trip-overview-grid" role="list">
          {tripDays.map((d, i) => {
            const label = fmtDayLabel(d.date);
            const active = d.id === selectedDayId;
            const isToday = d.date === todayStr;
            const s = summaries[d.id];
            return (
              <button
                key={d.id}
                type="button"
                role="listitem"
                className={`trip-overview-card${active ? ' active' : ''}${isToday ? ' is-today' : ''}${s?.overloaded ? ' over' : ''}`}
                onClick={() => pick(d.id)}
              >
                <span className="trip-overview-card-top">
                  <span className="trip-overview-wd">{label.weekday}</span>
                  {isToday && <span className="trip-overview-today">Today</span>}
                </span>
                <span className="trip-overview-num mono">{label.dayNum}</span>
                <span className="trip-overview-date">{label.date}</span>
                <span className="trip-overview-meta">
                  {loading || !s ? (
                    <span className="trip-overview-stops faint">…</span>
                  ) : s.stopCount === 0 ? (
                    <span className="trip-overview-stops faint">Empty</span>
                  ) : (
                    <span className="trip-overview-stops">
                      {s.stopCount} stop{s.stopCount === 1 ? '' : 's'}
                    </span>
                  )}
                  {!loading && s && s.stopCount > 0 && s.capacityMins > 0 && (
                    <span className={s.overloaded ? 'trip-overview-fit over' : 'trip-overview-fit'}>
                      {s.overloaded ? `Over ${fmtMins(-s.spareMins)}` : `Fits · ${fmtMins(s.spareMins)}`}
                    </span>
                  )}
                </span>
                <span className="trip-overview-pos">Day {i + 1}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
