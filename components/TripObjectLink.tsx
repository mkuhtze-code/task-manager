'use client';

import Link from 'next/link';
import type { TripLike } from '@/lib/travel/travelSurface';

type TripPressure = 'now' | 'soon' | 'later' | 'done';

type TripObjectLinkProps = {
  trip: TripLike;
  pressure: TripPressure;
  dateRange: string;
  stopCount: number | null;
  phaseLabel: string | null;
  relativeLine: string | null;
  dayCount: number | null;
};

export default function TripObjectLink({
  trip,
  pressure,
  dateRange,
  stopCount,
  phaseLabel,
  relativeLine,
  dayCount,
}: TripObjectLinkProps) {
  const stateLabel =
    pressure === 'now' ? 'active' :
    pressure === 'soon' ? 'upcoming soon' :
    pressure === 'done' ? 'past' : 'upcoming';
  const stopGlance = stopCount != null && stopCount > 0
    ? ' · ' + stopCount + ' stop' + (stopCount === 1 ? '' : 's')
    : '';

  return (
    <Link
      href={'/travel/' + trip.id}
      className="trip-row-link"
      aria-label={trip.name + ', ' + stateLabel + ', ' + dateRange + stopGlance + (phaseLabel ? ', ' + phaseLabel : '')}
      data-experience-object="trip"
      data-object-state={stateLabel}
      data-trip-id={trip.id}
    >
      <div className="trip-row-main" data-experience-part="summary">
        <div className="trip-row-top">
          <span className="trip-row-name surface-object-title" data-experience-part="title">
            {trip.name}
          </span>
          <span
            className="trip-row-glance surface-object-time mono"
            data-experience-part="glance"
            title={relativeLine || phaseLabel || undefined}
          >
            {dateRange}{stopGlance}
          </span>
        </div>
        {dayCount && dayCount > 1 ? (
          <span className="trip-row-context" data-experience-part="context">
            {dayCount} days
          </span>
        ) : null}
      </div>
    </Link>
  );
}
