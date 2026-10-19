'use client';

import ObjectRow from '@/components/instrument/ObjectRow';
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
    <ObjectRow
      href={'/travel/' + trip.id}
      className="trip-row-link"
      ariaLabel={trip.name + ', ' + stateLabel + ', ' + dateRange + stopGlance + (phaseLabel ? ', ' + phaseLabel : '')}
      objectType="trip"
      entityId={trip.id}
      state={stateLabel}
      identity={trip.name}
      glance={<span title={relativeLine || phaseLabel || undefined}>{dateRange}{stopGlance}</span>}
      context={dayCount && dayCount > 1 ? dayCount + ' days' : null}
    />
  );
}
