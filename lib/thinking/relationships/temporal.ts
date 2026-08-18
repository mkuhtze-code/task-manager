// lib/thinking/relationships/temporal.ts
//
// Deterministic temporal extraction and comparison. All functions use UTC
// to match the thinking engine's established convention (see taskLifecycle.ts
// utcDate). The UI converts to local time for display; the engine reasons
// about time in UTC to avoid timezone-dependent bugs.

export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night';

export type TemporalContext = {
  hour: number; // 0-23 UTC
  minute: number; // 0-59 UTC
  dayOfWeek: number // 0=Sun, 1=Mon, ... 6=Sat (UTC)
  date: string; // YYYY-MM-DD UTC
  period: TimePeriod;
};

/** Period boundaries in UTC hours. Explicit, testable, documented. */
export const PERIOD_BOUNDARIES = {
  morning: { start: 6, end: 12 }, // [06:00, 12:00)
  afternoon: { start: 12, end: 17 }, // [12:00, 17:00)
  evening: { start: 17, end: 21 }, // [17:00, 21:00)
  night: { start: 21, end: 6 }, // [21:00, 06:00) wraps midnight
} as const;

/** Classify an hour (0-23) into a time period. */
export function classifyPeriod(hour: number): TimePeriod {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Extract deterministic temporal components from an ISO 8601 timestamp.
 *
 * All values are UTC. This matches the thinking engine's convention of
 * UTC date comparison (see taskLifecycle.ts utcDate, clusterBehaviour.ts
 * sameDay). The UI layer converts to local time for display.
 */
export function extractTemporalContext(iso: string): TemporalContext {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid timestamp: ${iso}`);
  }
  return {
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dayOfWeek: d.getUTCDay(),
    date: utcDate(iso),
    period: classifyPeriod(d.getUTCHours()),
  };
}

/**
 * UTC date string from an ISO timestamp (YYYY-MM-DD).
 * Matches the existing convention in taskLifecycle.ts and clusterBehaviour.ts.
 */
export function utcDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Deterministic same-day comparison using UTC dates.
 *
 * Consistent with the thinking engine's established convention.
 * Returns false for invalid timestamps.
 */
export function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return utcDate(a) === utcDate(b);
}

/**
 * Group items by their UTC date. Returns a Map keyed by YYYY-MM-DD,
 * with values ordered by the original array order within each group.
 *
 * Items with invalid timestamps are excluded.
 */
export function groupByDate<T>(
  items: T[],
  getTimestamp: (item: T) => string | null
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const ts = getTimestamp(item);
    if (ts == null) continue;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) continue;
    const date = utcDate(ts);
    const existing = groups.get(date);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(date, [item]);
    }
  }
  return groups;
}
