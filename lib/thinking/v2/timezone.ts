import { CompletedTaskFacts } from '../types';

export function toLocalDate(iso: string, tz: string): string | null {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (!y || !m || !day) return null;
    return `${y}-${m}-${day}`;
  } catch {
    return null;
  }
}

export function toLocalHour(iso: string, tz: string): number | null {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(d);
    const h = parts.find((p) => p.type === 'hour')?.value;
    if (h === undefined) return null;
    return parseInt(h, 10);
  } catch {
    return null;
  }
}

export function toLocalDayOfWeek(iso: string, tz: string): number | null {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
    }).formatToParts(d);
    const dayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const wd = parts.find((p) => p.type === 'weekday')?.value;
    if (!wd) return null;
    return dayMap[wd] ?? null;
  } catch {
    return null;
  }
}

export function isSameLocalDay(a: string, b: string, tz: string): boolean {
  const dA = toLocalDate(a, tz);
  const dB = toLocalDate(b, tz);
  if (dA === null || dB === null) return false;
  return dA === dB;
}

export function isSameUtcDay(a: string, b: string): boolean {
  try {
    const dA = new Date(a);
    const dB = new Date(b);
    if (isNaN(dA.getTime()) || isNaN(dB.getTime())) return false;
    return dA.toISOString().slice(0, 10) === dB.toISOString().slice(0, 10);
  } catch {
    return false;
  }
}

export function utcDateStr(iso: string): string | null {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

export function classifyLocalPeriod(iso: string, tz: string): 'morning' | 'afternoon' | 'evening' | 'night' | null {
  const hour = toLocalHour(iso, tz);
  if (hour === null) return null;
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export function groupByLocalDate<T>(
  items: T[],
  getTimestamp: (item: T) => string | null,
  tz: string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const ts = getTimestamp(item);
    if (!ts) continue;
    const localDate = toLocalDate(ts, tz);
    if (!localDate) continue;
    const existing = groups.get(localDate);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(localDate, [item]);
    }
  }
  return groups;
}

/**
 * Difference in days between two LOCAL calendar date strings ('YYYY-MM-DD').
 * Both inputs must already be resolved local dates — this function does NOT
 * reinterpret them through a timezone (that would shift date-only strings,
 * because JS parses ISO date-only strings as UTC midnight).
 */
export function localDateDiffDays(aLocal: string, bLocal: string): number | null {
  try {
    const dateA = new Date(aLocal + 'T00:00:00Z');
    const dateB = new Date(bLocal + 'T00:00:00Z');
    if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return null;
    return Math.round((dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}
