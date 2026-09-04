import { CompletedTaskFacts } from '../types';
import {
  toLocalDate,
  toLocalHour,
  toLocalDayOfWeek,
  localDateDiffDays,
  classifyLocalPeriod,
  utcDateStr,
} from './timezone';

export type Period = 'morning' | 'afternoon' | 'evening' | 'night';

/** Order of periods through the day — used only for before/after comparisons. */
export const PERIOD_ORDER: Record<Period, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
  night: 3,
};

/**
 * A task's lifecycle as a set of precomputed, timezone-resolved temporal facts.
 *
 * These describe how a task moved through time — they are NOT work duration.
 * `activeDurationMin` is only populated from Start/Stop evidence; everything
 * else (latency, displacement, persistence) is lifecycle movement and must
 * never be reported as "how long the task took".
 */
export interface TemporalFacts {
  task: CompletedTaskFacts;
  createdLocal: string | null;
  completedLocal: string | null;
  createdHour: number | null;
  completedHour: number | null;
  createdDOW: number | null;
  completedDOW: number | null;
  createdPeriod: Period | null;
  completedPeriod: Period | null;
  surfaceLocal: string | null;
  /** The commitment date: surface date if scheduled, else creation for planned. */
  intendedLocal: string | null;
  /** Calendars-day lag from creation to completion (0 = same local date). */
  latencyDays: number | null;
  /** Wall-clock hours from creation to completion (absolute instants). */
  latencyHours: number | null;
  /** Calendars-day lag from intended date to completion. */
  displacementDays: number | null;
  /** Number of distinct local dates the task was active before completion. */
  persistenceDates: number | null;
  /** Only when Start/Stop evidence exists; otherwise null (genuinely unknown). */
  activeDurationMin: number | null;
}

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;

function hasIntendedDate(task: CompletedTaskFacts): boolean {
  return task.source === 'planned';
}

/**
 * Resolve a task's scheduled day. `surface_date` is a DATE-ONLY value
 * ('YYYY-MM-DD'); passing it through `toLocalDate(tz)` would reinterpret it
 * via the target timezone (JS parses date-only strings as UTC midnight, then
 * localises them), shifting the day across the timezone boundary. A date-only
 * string is kept as-is.
 */
function surfaceToLocalDate(surfaceDate: string | null, tz: string): string | null {
  if (!surfaceDate) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(surfaceDate)) {
    return utcDateStr(surfaceDate);
  }
  return toLocalDate(surfaceDate, tz);
}

function msDiff(later: string | null, earlier: string | null): number | null {
  if (!later || !earlier) return null;
  const l = new Date(later).getTime();
  const e = new Date(earlier).getTime();
  if (isNaN(l) || isNaN(e)) return null;
  return l - e;
}

/**
 * Normalise the temporal view of each task exactly once in a single pass.
 *
 * Even tasks with missing/invalid timestamps are returned (their fields are
 * null) so callers can count missing data without a second scan.
 */
export function normalizeTemporalFacts(
  tasks: CompletedTaskFacts[],
  tz: string,
): TemporalFacts[] {
  return tasks.map((task) => {
    const createdLocal = task.created_at ? toLocalDate(task.created_at, tz) : null;
    const completedLocal = task.completed_at ? toLocalDate(task.completed_at, tz) : null;

    // Intended/commitment date mirrors carryover semantics.
    let intendedLocal: string | null = null;
    const surfaced = surfaceToLocalDate(task.surface_date, tz);
    if (surfaced) {
      if (surfaced !== completedLocal) intendedLocal = surfaced;
    } else if (hasIntendedDate(task)) {
      intendedLocal = createdLocal;
    }

    const diffMs = msDiff(task.completed_at, task.created_at);
    const latencyHours = diffMs === null ? null : diffMs / HOUR_MS;
    const latencyDays =
      createdLocal && completedLocal
        ? localDateDiffDays(createdLocal, completedLocal)
        : null;
    const displacementDays =
      intendedLocal && completedLocal
        ? localDateDiffDays(intendedLocal, completedLocal)
        : null;
    const persistenceDates =
      latencyDays === null ? null : latencyDays + 1;

    // Active duration ONLY from Start/Stop evidence.
    const activeDiffMs = msDiff(task.completed_at, task.started_at);
    const activeDurationMin =
      task.started_at && task.completed_at && activeDiffMs !== null
        ? activeDiffMs / MINUTE_MS
        : null;

    return {
      task,
      createdLocal,
      completedLocal,
      createdHour: task.created_at ? toLocalHour(task.created_at, tz) : null,
      completedHour: task.completed_at ? toLocalHour(task.completed_at, tz) : null,
      createdDOW: task.created_at ? toLocalDayOfWeek(task.created_at, tz) : null,
      completedDOW: task.completed_at ? toLocalDayOfWeek(task.completed_at, tz) : null,
      createdPeriod: task.created_at ? classifyLocalPeriod(task.created_at, tz) : null,
      completedPeriod: task.completed_at ? classifyLocalPeriod(task.completed_at, tz) : null,
      surfaceLocal: surfaceToLocalDate(task.surface_date, tz),
      intendedLocal,
      latencyDays,
      latencyHours,
      displacementDays,
      persistenceDates,
      activeDurationMin,
    };
  });
}
