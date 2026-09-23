/** Travel stops = places + presence. Not Today tasks. */

export type StopKind = 'work' | 'leisure' | 'food' | 'stay' | 'other';
export type StopPresence = 'all_day' | 'work_hours' | 'fixed' | 'duration';

export const STOP_KIND_OPTIONS: { value: StopKind; label: string; hint: string }[] = [
  { value: 'work', label: 'Work site', hint: 'Linked to a job when you can' },
  { value: 'leisure', label: 'Activity / place', hint: 'Sightseeing, outing' },
  { value: 'food', label: 'Food', hint: 'Meal or café' },
  { value: 'stay', label: 'Stay', hint: 'Hotel, lodging' },
  { value: 'other', label: 'Other', hint: 'Anything else' },
];

export const PRESENCE_OPTIONS: { value: StopPresence; label: string; hint: string }[] = [
  { value: 'all_day', label: 'All day', hint: 'On site for the whole day' },
  { value: 'work_hours', label: 'Work hours', hint: 'Within your normal work window' },
  { value: 'fixed', label: 'At a time', hint: 'Arrive at a specific time' },
  { value: 'duration', label: 'For about…', hint: 'Flexible block of time' },
];

export function stopKindLabel(kind: StopKind | string | null | undefined): string {
  const k = (kind || 'leisure') as StopKind;
  return STOP_KIND_OPTIONS.find((o) => o.value === k)?.label || 'Stop';
}

export function presenceLabel(p: StopPresence | string | null | undefined): string {
  const v = (p || 'duration') as StopPresence;
  return PRESENCE_OPTIONS.find((o) => o.value === v)?.label || 'Duration';
}

/** Map presence + day window → estimate_mins and legacy time_type fields. */
export function presenceToSchedule(args: {
  presence: StopPresence;
  durationMins: number | null;
  fixedTime: string | null;
  dayStartMins: number;
  dayEndMins: number;
}): {
  estimate_mins: number;
  time_type: 'flexible' | 'fixed';
  fixed_time: string | null;
} {
  const window = Math.max(args.dayEndMins - args.dayStartMins, 60);

  switch (args.presence) {
    case 'all_day':
      return { estimate_mins: window, time_type: 'flexible', fixed_time: null };
    case 'work_hours':
      // Slightly under full window so evening leisure can still fit in capacity math
      return {
        estimate_mins: Math.min(window, Math.max(Math.round(window * 0.85), 240)),
        time_type: 'flexible',
        fixed_time: null,
      };
    case 'fixed':
      return {
        estimate_mins: args.durationMins && args.durationMins > 0 ? args.durationMins : 60,
        time_type: 'fixed',
        fixed_time: args.fixedTime,
      };
    case 'duration':
    default:
      return {
        estimate_mins: args.durationMins && args.durationMins > 0 ? args.durationMins : 30,
        time_type: 'flexible',
        fixed_time: null,
      };
  }
}

export function formatStopGlance(args: {
  presence: StopPresence | string | null | undefined;
  time_type: 'flexible' | 'fixed';
  fixed_time: string | null;
  estimate_mins: number;
  fmtMins: (n: number) => string;
  fmtClock: (t: string) => string;
}): string {
  const p = (args.presence || 'duration') as StopPresence;
  if (p === 'all_day') return 'All day';
  if (p === 'work_hours') return 'Work hours';
  if (args.time_type === 'fixed' && args.fixed_time) return args.fmtClock(args.fixed_time);
  return args.fmtMins(args.estimate_mins);
}
