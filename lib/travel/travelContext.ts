/**
 * Travel day capacity + engine context helpers.
 * Shared by trip Capture and processInteraction / ANSWER paths.
 */

export const DEFAULT_ARRIVAL_BUFFER_MINS = 45;

export type DayAnchor = {
  arrivalMins: number | null;
  departureMins: number | null;
  windowStartMins: number;
  windowEndMins: number;
  usableMins: number;
  source: 'arrival' | 'day_start' | 'default';
};

function parseClockMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function applyArrivalBuffer(landMins: number, bufferMins: number = DEFAULT_ARRIVAL_BUFFER_MINS): number {
  const safeBuffer = Math.min(180, Math.max(0, Number.isFinite(bufferMins) ? bufferMins : DEFAULT_ARRIVAL_BUFFER_MINS));
  return Math.min(24 * 60, Math.max(0, landMins) + safeBuffer);
}

export function resolveDayAnchor(day: {
  day_start?: string | null;
  day_end?: string | null;
  arrival_time?: string | null;
  departure_time?: string | null;
}, arrivalBufferMins: number = DEFAULT_ARRIVAL_BUFFER_MINS): DayAnchor {
  const arrivalMins = parseClockMinutes(day.arrival_time);
  const departureMins = parseClockMinutes(day.departure_time);
  const dayStartMins = parseClockMinutes(day.day_start);
  const dayEndMins = parseClockMinutes(day.day_end);
  const source: DayAnchor['source'] = arrivalMins !== null ? 'arrival' : dayStartMins !== null ? 'day_start' : 'default';
  const windowStartMins = arrivalMins !== null
    ? applyArrivalBuffer(arrivalMins, arrivalBufferMins)
    : dayStartMins ?? 8 * 60;
  const windowEndMins = departureMins ?? dayEndMins ?? 20 * 60;
  return {
    arrivalMins,
    departureMins,
    windowStartMins,
    windowEndMins,
    usableMins: Math.max(0, windowEndMins - windowStartMins),
    source,
  };
}

export type TravelDayWindow = {
  date: string;
  dayStartMins: number;
  dayEndMins: number;
  baseLocationText: string | null;
};

export type TravelActivitySlice = {
  estimateMins: number;
  driveMinsToNext: number;
  status?: 'pending' | 'done';
};

export type TravelEngineContext = {
  tripId: string;
  tripName: string;
  intent: 'work' | 'personal' | null;
  dayId: string | null;
  dayDate: string | null;
  dayStartMins: number | null;
  dayEndMins: number | null;
  baseLocationText: string | null;
  activityCount: number;
  plannedMins: number;
  remainingMins: number | null;
  driveFromBaseMins: number | null;
};

function timeStringToMinutes(t: string): number {
  const [h, m] = t.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return 0;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

/** Build day window from trip_days row fields. */
export function dayWindowFromTripDay(day: {
  date: string;
  day_start?: string | null;
  day_end?: string | null;
  arrival_time?: string | null;
  departure_time?: string | null;
  base_location_text?: string | null;
}): TravelDayWindow {
  const anchor = resolveDayAnchor(day);
  return {
    date: day.date,
    dayStartMins: anchor.windowStartMins,
    dayEndMins: anchor.windowEndMins,
    baseLocationText: day.base_location_text ?? null,
  };
}

/**
 * Remaining workable minutes on a trip day after planned stops + drives.
 * driveFromBaseMins is the base→first leg when known.
 */
export function remainingMinsOnTripDay(
  window: TravelDayWindow,
  activities: TravelActivitySlice[],
  driveFromBaseMins: number = 0
): number {
  const windowMins = Math.max(0, window.dayEndMins - window.dayStartMins);
  const planned = activities
    .filter((a) => a.status !== 'done')
    .reduce((sum, a) => sum + (a.estimateMins || 0) + (a.driveMinsToNext || 0), 0);
  return Math.max(0, windowMins - planned - Math.max(0, driveFromBaseMins));
}

export function buildTravelEngineContext(args: {
  tripId: string;
  tripName: string;
  intent?: 'work' | 'personal' | null;
  day: {
    id: string;
    date: string;
    day_start?: string | null;
    day_end?: string | null;
    arrival_time?: string | null;
    departure_time?: string | null;
    base_location_text?: string | null;
    drive_from_base_mins?: number | null;
  } | null;
  activities: TravelActivitySlice[];
  /** Only a linked itinerary flight may apply stored arrival/departure anchors. */
  flightScheduled?: boolean;
}): TravelEngineContext {
  if (!args.day) {
    return {
      tripId: args.tripId,
      tripName: args.tripName,
      intent: args.intent ?? null,
      dayId: null,
      dayDate: null,
      dayStartMins: null,
      dayEndMins: null,
      baseLocationText: null,
      activityCount: args.activities.length,
      plannedMins: 0,
      remainingMins: null,
      driveFromBaseMins: null,
    };
  }
  const anchor = resolveScheduledDayAnchor(args.day, args.flightScheduled ?? false);
  const window: TravelDayWindow = {
    date: args.day.date,
    dayStartMins: anchor.windowStartMins,
    dayEndMins: anchor.windowEndMins,
    baseLocationText: args.day.base_location_text ?? null,
  };
  const driveFromBase = args.day.drive_from_base_mins ?? 0;
  const planned = args.activities
    .filter((a) => a.status !== 'done')
    .reduce((sum, a) => sum + (a.estimateMins || 0) + (a.driveMinsToNext || 0), 0);
  const remaining = remainingMinsOnTripDay(window, args.activities, driveFromBase);
  return {
    tripId: args.tripId,
    tripName: args.tripName,
    intent: args.intent ?? null,
    dayId: args.day.id,
    dayDate: args.day.date,
    dayStartMins: window.dayStartMins,
    dayEndMins: window.dayEndMins,
    baseLocationText: window.baseLocationText,
    activityCount: args.activities.length,
    plannedMins: planned + Math.max(0, driveFromBase),
    remainingMins: remaining,
    driveFromBaseMins: driveFromBase,
  };
}
/**
 * Choose the day shown when a trip is opened. Today wins when it falls within
 * the trip; trips wholly in the past open on their final day, future trips on
 * their first. Sorting here keeps the behavior stable for unsorted callers.
 */
export function selectInitialTripDay<T extends { id: string; date: string }>(
  days: readonly T[],
  today: string,
): T | null {
  if (days.length === 0) return null;
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const todayMatch = ordered.find((day) => day.date === today);
  if (todayMatch) return todayMatch;
  return today < ordered[0].date ? ordered[0] : ordered[ordered.length - 1];
}


/**
 * Flight times only constrain the day when a flight is actually scheduled on
 * its itinerary. Stale/manual flight anchors in a trip_days row must not make
 * every ordinary day behave like an airport day.
 */
export function resolveScheduledDayAnchor(
  day: {
    day_start?: string | null;
    day_end?: string | null;
    arrival_time?: string | null;
    departure_time?: string | null;
  },
  flightScheduled: boolean,
  arrivalBufferMins: number = DEFAULT_ARRIVAL_BUFFER_MINS,
): DayAnchor {
  return resolveDayAnchor(
    flightScheduled
      ? day
      : { ...day, arrival_time: null, departure_time: null },
    arrivalBufferMins,
  );
}
