// lib/thinking/v3/temporal.ts
//
// Phase 5.5 — unified temporal / timezone semantics.
// All same-day, local-date, and age calculations should go through here.
// Pure. Deterministic when `now` and timezone are explicit.

export type UserCalendarContext = {
  timezone: string;
  /** YYYY-MM-DD in the user's timezone. */
  localDate: string;
  /** Local hour 0–23. */
  localHour: number;
  /** 0 = Sunday … 6 = Saturday (local). */
  dayOfWeek: number;
  /** Start of local calendar day as ISO UTC. */
  dayStartIso: string;
  /** End of local calendar day as ISO UTC. */
  dayEndIso: string;
  /** Current instant (ISO). */
  nowIso: string;
};

export type DayPeriod =
  | 'early'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'evening'
  | 'night';

const DEFAULT_TZ = 'UTC';

/**
 * Format a Date as YYYY-MM-DD in a given IANA timezone.
 * Falls back to UTC slicing if the timezone is invalid.
 */
export function localDateString(
  isoOrDate: string | Date,
  timezone: string = DEFAULT_TZ
): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function localHour(
  isoOrDate: string | Date,
  timezone: string = DEFAULT_TZ
): number {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return 0;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(d);
    const h = parts.find((p) => p.type === 'hour')?.value;
    const n = h != null ? parseInt(h, 10) : d.getUTCHours();
    return n === 24 ? 0 : n;
  } catch {
    return d.getUTCHours();
  }
}

export function localDayOfWeek(
  isoOrDate: string | Date,
  timezone: string = DEFAULT_TZ
): number {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return 0;
  try {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).format(d);
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return map[weekday] ?? d.getUTCDay();
  } catch {
    return d.getUTCDay();
  }
}

/** Same calendar day in the given timezone (not UTC-by-accident). */
export function sameLocalCalendarDay(
  a: string,
  b: string,
  timezone: string = DEFAULT_TZ
): boolean {
  const da = localDateString(a, timezone);
  const db = localDateString(b, timezone);
  if (!da || !db) return false;
  return da === db;
}

/**
 * Historical task age in days from creation to completion.
 * Uses completed_at - created_at, NOT wall-clock now.
 */
export function completionAgeDays(
  createdAt: string | null | undefined,
  completedAt: string | null | undefined
): number | null {
  if (!createdAt || !completedAt) return null;
  const c = new Date(createdAt).getTime();
  const d = new Date(completedAt).getTime();
  if (Number.isNaN(c) || Number.isNaN(d) || d < c) return null;
  return (d - c) / (1000 * 60 * 60 * 24);
}

/**
 * Stall / age at a historical point — never uses "now" for completed work.
 * For open tasks, pass an explicit `asOf` timestamp.
 */
export function taskAgeDaysAt(
  createdAt: string,
  asOf: string
): number | null {
  const c = new Date(createdAt).getTime();
  const a = new Date(asOf).getTime();
  if (Number.isNaN(c) || Number.isNaN(a) || a < c) return null;
  return (a - c) / (1000 * 60 * 60 * 24);
}

export function periodFromLocalHour(hour: number): DayPeriod {
  const h = Math.floor(hour);
  if (h < 6) return 'early';
  if (h < 10) return 'morning';
  if (h < 13) return 'midday';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

export function buildUserCalendarContext(
  nowIso: string,
  timezone: string = DEFAULT_TZ
): UserCalendarContext {
  const localDate = localDateString(nowIso, timezone);
  const hour = localHour(nowIso, timezone);
  const dayOfWeek = localDayOfWeek(nowIso, timezone);
  const dayStartIso = `${localDate}T00:00:00.000Z`;
  const dayEndIso = `${localDate}T23:59:59.999Z`;
  return {
    timezone,
    localDate,
    localHour: hour,
    dayOfWeek,
    dayStartIso,
    dayEndIso,
    nowIso,
  };
}
