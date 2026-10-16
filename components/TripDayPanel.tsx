'use client';

import type { DayAnchor } from '@/lib/travel/travelContext';
import { PlusIcon } from '@/components/icons';

export type TripDayPanelDay = {
  id: string;
  date: string;
  arrival_time: string | null;
  departure_time: string | null;
};

type Props = {
  day: TripDayPanelDay;
  dayNumber: number;
  dayCount: number;
  dayAnchor: DayAnchor;
  dayLabel: string;
  fitLabel: string;
  meetingCount: number;
  daySheetOpen: boolean;
  onOpenDaySheet: () => void;
  onSaveArrival: (value: string | null) => Promise<void>;
  onSaveDeparture: (value: string | null) => Promise<void>;
  onAddStop: () => void;
};

function fmtMins(mins: number): string {
  mins = Math.round(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatClockMinutes(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${hour24 % 12 || 12}:${String(minute).padStart(2, '0')}${hour24 >= 12 ? 'p' : 'a'}`;
}

export default function TripDayPanel({
  day, dayNumber, dayCount, dayAnchor, dayLabel, fitLabel, meetingCount, daySheetOpen,
  onOpenDaySheet, onSaveArrival, onSaveDeparture, onAddStop,
}: Props) {
  const windowLabel = dayAnchor.arrivalMins !== null
    ? `Land ${formatClockMinutes(dayAnchor.arrivalMins)} · opens ${formatClockMinutes(dayAnchor.windowStartMins)} · ~${fmtMins(dayAnchor.usableMins)} usable`
    : dayAnchor.departureMins !== null
      ? `Depart ${formatClockMinutes(dayAnchor.departureMins)} · closes ${formatClockMinutes(dayAnchor.windowEndMins)} · ~${fmtMins(dayAnchor.usableMins)} usable`
      : `Window ${formatClockMinutes(dayAnchor.windowStartMins)}–${formatClockMinutes(dayAnchor.windowEndMins)} · ~${fmtMins(dayAnchor.usableMins)} usable`;

  return (
    <section className="trip-day-panel" aria-label="Selected trip day">
      <div className="trip-day-panel-identity">
        <span className="trip-day-panel-day">{dayCount > 1 ? `Day ${dayNumber} of ${dayCount}` : 'Trip day'}</span>
        <span className="trip-day-panel-date">{dayLabel}</span>
      </div>
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
      <div className="trip-day-window mono">{windowLabel}</div>
      <div className="trip-day-panel-times">
        <label>Land
          <input aria-label="Arrival time" type="time" defaultValue={day.arrival_time || ''} key={`${day.id}-arrival-${day.arrival_time || ''}`} onBlur={async (e) => {
            const value = e.currentTarget.value || null;
            if (value !== (day.arrival_time || null)) await onSaveArrival(value);
          }} />
        </label>
        <label>Depart
          <input aria-label="Departure time" type="time" defaultValue={day.departure_time || ''} key={`${day.id}-departure-${day.departure_time || ''}`} onBlur={async (e) => {
            const value = e.currentTarget.value || null;
            if (value !== (day.departure_time || null)) await onSaveDeparture(value);
          }} />
        </label>
      </div>
      <button type="button" className="btn btn-steel trip-day-add-stop" onClick={onAddStop}>
        <PlusIcon size={16} /> Add stop
      </button>
    </section>
  );
}
