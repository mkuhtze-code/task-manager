'use client';

import type { DayAnchor } from '@/lib/travel/travelContext';
import { PlusIcon } from '@/components/icons';

type Props = {
  dayAnchor: DayAnchor;
  flightScheduled: boolean;
  fitLabel: string;
  conflictCount: number;
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

function formatMins(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe}m`;
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

export default function TripDayPanel({
  dayAnchor, flightScheduled, fitLabel, conflictCount, meetingCount, daySheetOpen,
  onOpenDaySheet, onAddStop,
}: Props) {
  const windowStart = formatClockMinutes(dayAnchor.windowStartMins);
  const windowEnd = formatClockMinutes(dayAnchor.windowEndMins);
  const flightContext = [
    dayAnchor.arrivalMins !== null ? `Land ${formatClockMinutes(dayAnchor.arrivalMins)}` : null,
    `planning ${windowStart}–${windowEnd}`,
    dayAnchor.departureMins !== null ? `Depart ${formatClockMinutes(dayAnchor.departureMins)}` : null,
    `${formatMins(dayAnchor.usableMins)} usable`,
  ].filter(Boolean).join(' · ');
  const windowGlance = flightScheduled
    ? `Flight · ${flightContext}`
    : `Day window · ${windowStart}–${windowEnd} · ${formatMins(dayAnchor.usableMins)} usable`;

  return (
    <section className="trip-day-panel" aria-label="Selected trip day">
      <button type="button" className="btn btn-steel trip-day-add-stop" onClick={onAddStop}>
        <PlusIcon size={16} /> Add stop
      </button>
      <div className="trip-day-window mono">{windowGlance}</div>
      <button
        type="button"
        className="trip-day-panel-fit"
        onClick={onOpenDaySheet}
        aria-expanded={daySheetOpen}
      >
        <span>{fitLabel}</span>
        {conflictCount > 0 && (
          <span className="trip-day-panel-conflicts">
            {conflictCount} conflict{conflictCount === 1 ? '' : 's'}
          </span>
        )}
        {meetingCount > 0 && <span>{meetingCount === 1 ? '1 meeting' : `${meetingCount} meetings`}</span>}
        <span className="trip-day-panel-details">Day details</span>
      </button>
    </section>
  );
}
