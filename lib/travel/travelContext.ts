/**
 * Travel day capacity + engine context helpers.
 * Shared by trip Capture and processInteraction / ANSWER paths.
 */

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
  const start =
    day.arrival_time || day.day_start || '08:00';
  const end = day.departure_time || day.day_end || '20:00';
  return {
    date: day.date,
    dayStartMins: timeStringToMinutes(start),
    dayEndMins: timeStringToMinutes(end),
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
  const window = dayWindowFromTripDay(args.day);
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