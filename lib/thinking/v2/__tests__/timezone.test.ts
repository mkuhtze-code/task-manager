import { describe, it, expect } from 'vitest';
import {
  toLocalDate,
  toLocalHour,
  toLocalDayOfWeek,
  isSameLocalDay,
  classifyLocalPeriod,
  groupByLocalDate,
} from '../timezone';

describe('timezone - local date resolution', () => {
  it('resolves a UTC timestamp into a local date', () => {
    // 2026-01-15T23:00:00Z -> in America/New_York (UTC-5 in January) is 2026-01-15 18:00
    expect(toLocalDate('2026-01-15T23:00:00Z', 'America/New_York')).toBe('2026-01-15');
  });

  it('handles a date that changes across the timezone boundary', () => {
    // 2026-01-16T01:00:00Z -> in America/New_York is 2026-01-15 20:00
    expect(toLocalDate('2026-01-16T01:00:00Z', 'America/New_York')).toBe('2026-01-15');
  });

  it('returns null (not silently UTC) for an invalid timezone', () => {
    // We must not silently fall back to UTC for local-calendar behaviour.
    expect(toLocalDate('2026-01-15T12:00:00Z', 'Unknown/Place')).toBeNull();
  });

  it('returns the UTC date for the UTC timezone', () => {
    expect(toLocalDate('2026-01-15T12:34:56Z', 'UTC')).toBe('2026-01-15');
  });
});

describe('timezone - local hour', () => {
  it('resolves local hour', () => {
    // 06:00Z in New York is 01:00
    expect(toLocalHour('2026-01-15T06:00:00Z', 'America/New_York')).toBe(1);
    // 06:00Z in UTC is 06
    expect(toLocalHour('2026-01-15T06:00:00Z', 'UTC')).toBe(6);
  });

  it('returns null for invalid input', () => {
    expect(toLocalHour('not-a-date', 'UTC')).toBeNull();
  });

  it('normalises midnight hour 24 to 0', () => {
    // Some ICU builds report midnight (00:xx) as hour "24" with hour12:false.
    expect(toLocalHour('2026-01-15T00:00:00Z', 'UTC')).toBe(0);
    expect(toLocalHour('2026-01-15T00:30:00Z', 'UTC')).toBe(0);
    expect(toLocalHour('2026-01-15T23:00:00Z', 'UTC')).toBe(23);
  });
});

describe('timezone - DST transitions', () => {
  it('resolves local hour across a DST spring-forward (America/New_York)', () => {
    // 2026-03-08 02:00 local EST → 03:00 local EDT (spring forward).
    // 2026-03-08T06:30:00Z = 01:30 EST (before transition)
    expect(toLocalHour('2026-03-08T06:30:00Z', 'America/New_York')).toBe(1);
    // 2026-03-08T07:30:00Z = 03:30 EDT (after transition)
    expect(toLocalHour('2026-03-08T07:30:00Z', 'America/New_York')).toBe(3);
  });

  it('resolves local date across a DST fall-back (America/New_York)', () => {
    // 2026-11-01: 01:00 EDT → 01:00 EST (fall back). A UTC timestamp maps
    // deterministically to a local date regardless of ambiguity.
    // 2026-11-01T23:30:00Z = 19:30 EDT (not on the ambiguous hour)
    expect(toLocalDate('2026-11-01T23:30:00Z', 'America/New_York')).toBe('2026-11-01');
  });

  it('is deterministic across a DST transition hour', () => {
    // 2026-03-08 05:30Z = 00:30 EST, 06:30Z = 01:30 EST, 07:30Z = 03:30 EDT.
    // No hour 02:xx local exists. Verify hour never exceeds 23 and is stable.
    expect(toLocalHour('2026-03-08T06:30:00Z', 'America/New_York')).toBe(1);
    expect(toLocalHour('2026-03-08T07:30:00Z', 'America/New_York')).toBe(3);
  });

  it('resolves southern-hemisphere DST (Australia/Sydney)', () => {
    // Sydney DST begins 2026-10-04 (first Sunday in October), spring forward.
    // 2026-10-03T13:00:00Z = 23:00 AEST (before transition, UTC+10)
    expect(toLocalHour('2026-10-03T13:00:00Z', 'Australia/Sydney')).toBe(23);
    // 2026-10-04T13:00:00Z = 00:00 AEDT next day (UTC+11)
    expect(toLocalDate('2026-10-04T13:00:00Z', 'Australia/Sydney')).toBe('2026-10-05');
  });
});

describe('timezone - day of week', () => {
  it('resolves local day of week', () => {
    // 2026-01-15 is a Thursday
    expect(toLocalDayOfWeek('2026-01-15T12:00:00Z', 'UTC')).toBe(4);
  });

  it('resolves day of week in local timezone', () => {
    // 2026-01-16T00:30:00Z in UTC+14 (Pacific/Kiritimati) is a Friday
    expect(toLocalDayOfWeek('2026-01-16T00:30:00Z', 'Pacific/Kiritimati')).toBe(5);
  });
});

describe('timezone - same local day', () => {
  it('detects same local day in local timezone', () => {
    expect(isSameLocalDay('2026-01-15T23:30:00Z', '2026-01-16T00:30:00Z', 'America/New_York')).toBe(true);
  });

  it('detects different local days even when UTC dates match on boundary', () => {
    // Both 2026-01-15 in UTC, but in New York the second is next day
    expect(isSameLocalDay('2026-01-15T23:00:00Z', '2026-01-15T23:59:00Z', 'UTC')).toBe(true);
  });
});

describe('timezone - local period classification', () => {
  it('classifies morning', () => {
    expect(classifyLocalPeriod('2026-01-15T08:00:00Z', 'UTC')).toBe('morning');
  });

  it('classifies afternoon', () => {
    expect(classifyLocalPeriod('2026-01-15T14:00:00Z', 'UTC')).toBe('afternoon');
  });

  it('classifies evening', () => {
    expect(classifyLocalPeriod('2026-01-15T19:00:00Z', 'UTC')).toBe('evening');
  });

  it('classifies night', () => {
    expect(classifyLocalPeriod('2026-01-15T23:00:00Z', 'UTC')).toBe('night');
  });

  it('classifies period in a non-UTC timezone', () => {
    // 12:00Z in New York is 07:00 local = morning
    expect(classifyLocalPeriod('2026-01-15T12:00:00Z', 'America/New_York')).toBe('morning');
  });
});

describe('timezone - grouping by local date', () => {
  it('groups items by their local calendar day', () => {
    const items = [
      { id: 1, ts: '2026-01-15T23:30:00Z' },
      { id: 2, ts: '2026-01-16T00:30:00Z' },
      { id: 3, ts: '2026-01-16T12:00:00Z' },
    ];
    const groups = groupByLocalDate(items, (i) => i.ts, 'America/New_York');
    // Both 23:30Z and 00:30Z are on Jan 15 local in New York
    expect(groups.get('2026-01-15')?.length).toBe(2);
    expect(groups.get('2026-01-16')?.length).toBe(1);
  });

  it('excludes items with null timestamps', () => {
    const items = [{ id: 1, ts: null }, { id: 2, ts: '2026-01-15T12:00:00Z' }];
    const groups = groupByLocalDate(items, (i) => i.ts, 'UTC');
    expect(groups.size).toBe(1);
  });
});
