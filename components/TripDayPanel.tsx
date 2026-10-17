'use client';

import type { DayAnchor } from '@/lib/travel/travelContext';
import { PlusIcon } from '@/components/icons';

type Props = {
  dayAnchor: DayAnchor;
  flightScheduled: boolean;
  fitLabel: string;
  meetingCount: number;
  daySheetOpen: boolean;
  onOpenDaySheet: () => void;
  onAddStop: () => void;
};

function formatClockMinutes(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${hour24 % 12 || 12}:${String(minute).padStart(2, '0')}${hour24 >= 12 ? 'p' : 'a'}`;
}

export default function TripDayPanel({
  dayAnchor, flightScheduled, fitLabel, meetingCount, daySheetOpen,
  onOpenDaySheet, onAddStop,
}: Props) {
  const flightWindowLabel = !flightScheduled ? null : [
    dayAnchor.arrivalMins !== null ? `Land ${formatClockMinutes(dayAnchor.arrivalMins)}` : null,
    dayAnchor.arrivalMins !== null ? `planning after ${formatClockMinutes(dayAnchor.windowStartMins)}` : null,
    dayAnchor.departureMins !== null ? `Depart ${formatClockMinutes(dayAnchor.departureMins)}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section className="trip-day-panel" aria-label="Selected trip day">
      <button
        type="button"
        className="trip-day-panel-fit"
        onClick={onOpenDaySheet}
        aria-expanded={daySheetOpen}
      >
        <span>{fitLabel}</span>
        {meetingCount > 0 && <span>{meetingCount === 1 ? '1 meeting' : `${meetingCount} meetings`}</span>}
        <span className="trip-day-panel-details">Day details</span>
      </button>
      {flightWindowLabel && <div className="trip-day-window mono">Flight · {flightWindowLabel}</div>}
      <button type="button" className="btn btn-steel trip-day-add-stop" onClick={onAddStop}>
        <PlusIcon size={16} /> Add stop
      </button>
    </section>
  );
}
