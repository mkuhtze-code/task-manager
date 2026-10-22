'use client';

import type { ReactNode } from 'react';
import type { DayAnchor } from '@/lib/travel/travelContext';
import { PlusIcon } from '@/components/icons';

type Props = {
  dayAnchor: DayAnchor;
  dayLabel?: string;
  dateLabel?: string;
  secondary?: ReactNode;
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
  dayAnchor, dayLabel = 'Trip day', dateLabel, flightScheduled, fitLabel, conflictCount, meetingCount, daySheetOpen,
  onOpenDaySheet, onAddStop, secondary,
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
    <section className="trip-day-panel ins-travel-day-instrument" aria-label="Selected trip day" data-testid="travel-trip-day-instrument">
      <div className="ins-travel-day__identity">
        <div className="ins-travel-day__name">
          <p className="ins-travel-eyebrow">Trip day</p>
          <h2>{dayLabel}</h2>
          {dateLabel ? <span className="ins-travel-day__date">{dateLabel}</span> : null}
        </div>
        <div className="ins-travel-day__pulse" aria-live="polite">
          <strong className="ins-travel-day__window">{windowGlance}</strong>
          <span className="ins-travel-day__fit">{fitLabel}</span>
          <span className="ins-travel-day__meta">
            {conflictCount > 0 ? `${conflictCount} conflict${conflictCount === 1 ? '' : 's'}` : 'No conflicts'}
            {meetingCount > 0 ? ` · ${meetingCount} meeting${meetingCount === 1 ? '' : 's'}` : ''}
          </span>
        </div>
      </div>
      <div className="ins-travel-day__primary">
        <button type="button" className="btn btn-steel trip-day-add-stop" onClick={onAddStop} data-testid="travel-add-stop-primary">
          <PlusIcon size={16} /> Add stop
        </button>
      </div>
      {secondary ? <div className="ins-travel-day__tools">{secondary}</div> : null}
      <button
        type="button"
        className="trip-day-panel-fit ins-travel-day__details"
        onClick={onOpenDaySheet}
        aria-expanded={daySheetOpen}
      >
        <span>Day details</span>
        <span className="trip-day-panel-details">Open schedule and fit</span>
      </button>
    </section>
  );
}
