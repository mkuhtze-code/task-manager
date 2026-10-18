export type PlannedTripDay = { id: string; date: string };
export type PlannedTripActivity = { id: string; trip_day_id: string; order_index?: number | null };

export type TripDateRangePlan = {
  valid: boolean;
  error: string | null;
  startDate: string;
  endDate: string;
  addedDates: string[];
  removedDays: PlannedTripDay[];
  orphanedActivities: PlannedTripActivity[];
  activityMoves: Array<{ activityId: string; fromDayId: string; toDate: string }>;
};

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

function dateString(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function dayNumber(value: string): number {
  return Math.floor((parseDate(value)?.getTime() ?? 0) / 86_400_000);
}

export function enumerateTripDates(startDate: string, endDate: string): string[] {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || start > end) return [];
  const dates: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(dateString(cursor));
    if (dates.length > 370) return [];
  }
  return dates;
}

/**
 * Computes a non-destructive date-range change. Activities on removed days are
 * explicit orphans and are assigned to the nearest retained date; callers must
 * confirm this plan before applying it. No activity is ever marked for deletion.
 */
export function planTripDateRangeChange(args: {
  currentStartDate: string;
  currentEndDate: string;
  nextStartDate: string;
  nextEndDate: string;
  days: PlannedTripDay[];
  activities: PlannedTripActivity[];
}): TripDateRangePlan {
  const nextDates = enumerateTripDates(args.nextStartDate, args.nextEndDate);
  const currentStart = parseDate(args.currentStartDate);
  const currentEnd = parseDate(args.currentEndDate);
  if (!currentStart || !currentEnd || currentStart > currentEnd) {
    return { valid: false, error: 'The current trip range is invalid.', startDate: args.nextStartDate, endDate: args.nextEndDate, addedDates: [], removedDays: [], orphanedActivities: [], activityMoves: [] };
  }
  if (!parseDate(args.nextStartDate) || !parseDate(args.nextEndDate) || args.nextStartDate > args.nextEndDate) {
    return { valid: false, error: 'End date must be on or after start date.', startDate: args.nextStartDate, endDate: args.nextEndDate, addedDates: [], removedDays: [], orphanedActivities: [], activityMoves: [] };
  }
  if (!nextDates.length || nextDates.length > 370) {
    return { valid: false, error: 'A trip must contain between 1 and 370 days.', startDate: args.nextStartDate, endDate: args.nextEndDate, addedDates: [], removedDays: [], orphanedActivities: [], activityMoves: [] };
  }
  const nextSet = new Set(nextDates);
  const currentDayByDate = new Map(args.days.map((day) => [day.date, day]));
  const removedDays = args.days.filter((day) => !nextSet.has(day.date));
  const addedDates = nextDates.filter((date) => !currentDayByDate.has(date));
  const removedIds = new Set(removedDays.map((day) => day.id));
  const orphanedActivities = args.activities.filter((activity) => removedIds.has(activity.trip_day_id));
  const retainedDates = nextDates;
  const activityMoves = orphanedActivities.map((activity) => {
    const target = retainedDates.reduce((best, date) =>
      Math.abs(dayNumber(date) - dayNumber(removedDays.find((day) => day.id === activity.trip_day_id)!.date)) <
      Math.abs(dayNumber(best) - dayNumber(removedDays.find((day) => day.id === activity.trip_day_id)!.date)
        ? date : best
    , retainedDates[0]);
    return { activityId: activity.id, fromDayId: activity.trip_day_id, toDate: target };
  });
  return { valid: true, error: null, startDate: args.nextStartDate, endDate: args.nextEndDate, addedDates, removedDays, orphanedActivities, activityMoves };
}
