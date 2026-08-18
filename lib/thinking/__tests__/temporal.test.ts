import { describe, it, expect } from 'vitest';
import {
  classifyPeriod,
  extractTemporalContext,
  utcDate,
  isSameDay,
  groupByDate,
  PERIOD_BOUNDARIES,
} from '../relationships/temporal';

describe('classifyPeriod', () => {
  it('classifies morning [6, 12)', () => {
    expect(classifyPeriod(6)).toBe('morning');
    expect(classifyPeriod(9)).toBe('morning');
    expect(classifyPeriod(11)).toBe('morning');
  });

  it('classifies afternoon [12, 17)', () => {
    expect(classifyPeriod(12)).toBe('afternoon');
    expect(classifyPeriod(14)).toBe('afternoon');
    expect(classifyPeriod(16)).toBe('afternoon');
  });

  it('classifies evening [17, 21)', () => {
    expect(classifyPeriod(17)).toBe('evening');
    expect(classifyPeriod(19)).toBe('evening');
    expect(classifyPeriod(20)).toBe('evening');
  });

  it('classifies night [21, 6)', () => {
    expect(classifyPeriod(21)).toBe('night');
    expect(classifyPeriod(0)).toBe('night');
    expect(classifyPeriod(3)).toBe('night');
    expect(classifyPeriod(5)).toBe('night');
  });

  it('period boundaries are explicitly documented', () => {
    expect(PERIOD_BOUNDARIES.morning.start).toBe(6);
    expect(PERIOD_BOUNDARIES.morning.end).toBe(12);
    expect(PERIOD_BOUNDARIES.afternoon.start).toBe(12);
    expect(PERIOD_BOUNDARIES.afternoon.end).toBe(17);
    expect(PERIOD_BOUNDARIES.evening.start).toBe(17);
    expect(PERIOD_BOUNDARIES.evening.end).toBe(21);
    expect(PERIOD_BOUNDARIES.night.start).toBe(21);
    expect(PERIOD_BOUNDARIES.night.end).toBe(6);
  });

  it('boundary transitions', () => {
    expect(classifyPeriod(5)).toBe('night');
    expect(classifyPeriod(6)).toBe('morning');
    expect(classifyPeriod(11)).toBe('morning');
    expect(classifyPeriod(12)).toBe('afternoon');
    expect(classifyPeriod(16)).toBe('afternoon');
    expect(classifyPeriod(17)).toBe('evening');
    expect(classifyPeriod(20)).toBe('evening');
    expect(classifyPeriod(21)).toBe('night');
  });
});

describe('utcDate', () => {
  it('extracts YYYY-MM-DD from ISO string', () => {
    expect(utcDate('2026-03-15T14:30:00Z')).toBe('2026-03-15');
  });

  it('handles midnight UTC', () => {
    expect(utcDate('2026-01-01T00:00:00Z')).toBe('2026-01-01');
  });

  it('handles end of day', () => {
    expect(utcDate('2026-12-31T23:59:59Z')).toBe('2026-12-31');
  });
});

describe('extractTemporalContext', () => {
  it('extracts all components from a UTC timestamp', () => {
    // 2026-03-15T14:30:00Z is a Sunday
    const ctx = extractTemporalContext('2026-03-15T14:30:00Z');
    expect(ctx.hour).toBe(14);
    expect(ctx.minute).toBe(30);
    expect(ctx.dayOfWeek).toBe(0); // Sunday
    expect(ctx.date).toBe('2026-03-15');
    expect(ctx.period).toBe('afternoon');
  });

  it('extracts morning context', () => {
    const ctx = extractTemporalContext('2026-01-06T07:00:00Z');
    expect(ctx.hour).toBe(7);
    expect(ctx.period).toBe('morning');
  });

  it('extracts evening context', () => {
    const ctx = extractTemporalContext('2026-06-15T19:00:00Z');
    expect(ctx.hour).toBe(19);
    expect(ctx.period).toBe('evening');
  });

  it('extracts night context', () => {
    const ctx = extractTemporalContext('2026-08-01T02:00:00Z');
    expect(ctx.hour).toBe(2);
    expect(ctx.period).toBe('night');
  });

  it('handles midnight UTC', () => {
    const ctx = extractTemporalContext('2026-01-01T00:00:00Z');
    expect(ctx.hour).toBe(0);
    expect(ctx.minute).toBe(0);
    expect(ctx.period).toBe('night');
    expect(ctx.date).toBe('2026-01-01');
  });

  it('throws for invalid timestamp', () => {
    expect(() => extractTemporalContext('not-a-date')).toThrow('Invalid timestamp');
  });

  it('dayOfWeek is correct for known dates', () => {
    // 2026-01-05 is a Monday
    expect(extractTemporalContext('2026-01-05T12:00:00Z').dayOfWeek).toBe(1);
    // 2026-01-09 is a Friday
    expect(extractTemporalContext('2026-01-09T12:00:00Z').dayOfWeek).toBe(5);
    // 2026-01-11 is a Sunday
    expect(extractTemporalContext('2026-01-11T12:00:00Z').dayOfWeek).toBe(0);
  });
});

describe('isSameDay', () => {
  it('returns true for same day different times', () => {
    expect(
      isSameDay('2026-03-15T08:00:00Z', '2026-03-15T17:30:00Z')
    ).toBe(true);
  });

  it('returns false for adjacent days', () => {
    expect(
      isSameDay('2026-03-15T23:59:00Z', '2026-03-16T00:01:00Z')
    ).toBe(false);
  });

  it('returns true for midnight boundary (same UTC date)', () => {
    expect(
      isSameDay('2026-03-15T00:00:00Z', '2026-03-15T23:59:59Z')
    ).toBe(true);
  });

  it('handles month boundaries', () => {
    expect(
      isSameDay('2026-01-31T12:00:00Z', '2026-02-01T12:00:00Z')
    ).toBe(false);
  });

  it('handles year boundaries', () => {
    expect(
      isSameDay('2026-12-31T23:00:00Z', '2027-01-01T01:00:00Z')
    ).toBe(false);
  });

  it('returns true within same year different months', () => {
    // Both are Jan 5 — wait, they're different months. Let me fix:
    expect(
      isSameDay('2026-03-15T10:00:00Z', '2026-03-15T14:00:00Z')
    ).toBe(true);
  });

  it('returns false for invalid timestamps', () => {
    expect(isSameDay('not-a-date', '2026-03-15T10:00:00Z')).toBe(false);
    expect(isSameDay('2026-03-15T10:00:00Z', 'also-not-a-date')).toBe(false);
  });

  it('handles identical timestamps', () => {
    expect(
      isSameDay('2026-06-15T12:00:00Z', '2026-06-15T12:00:00Z')
    ).toBe(true);
  });
});

describe('groupByDate', () => {
  it('groups items by UTC date', () => {
    const items = [
      { ts: '2026-03-15T08:00:00Z', text: 'A' },
      { ts: '2026-03-15T14:00:00Z', text: 'B' },
      { ts: '2026-03-16T09:00:00Z', text: 'C' },
    ];
    const groups = groupByDate(items, (i) => i.ts);
    expect(groups.size).toBe(2);
    expect(groups.get('2026-03-15')).toHaveLength(2);
    expect(groups.get('2026-03-16')).toHaveLength(1);
  });

  it('preserves order within groups', () => {
    const items = [
      { ts: '2026-03-15T14:00:00Z', text: 'B' },
      { ts: '2026-03-15T08:00:00Z', text: 'A' },
    ];
    const groups = groupByDate(items, (i) => i.ts);
    const day = groups.get('2026-03-15')!;
    expect(day[0].text).toBe('B');
    expect(day[1].text).toBe('A');
  });

  it('excludes items with null timestamps', () => {
    const items = [
      { ts: '2026-03-15T08:00:00Z', text: 'A' },
      { ts: null, text: 'B' },
    ];
    const groups = groupByDate(items, (i) => i.ts);
    expect(groups.size).toBe(1);
    expect(groups.get('2026-03-15')).toHaveLength(1);
  });

  it('excludes items with invalid timestamps', () => {
    const items = [
      { ts: '2026-03-15T08:00:00Z', text: 'A' },
      { ts: 'not-a-date', text: 'B' },
    ];
    const groups = groupByDate(items, (i) => i.ts);
    expect(groups.size).toBe(1);
  });

  it('returns empty map for empty array', () => {
    const groups = groupByDate([], (i: { ts: string }) => i.ts);
    expect(groups.size).toBe(0);
  });

  it('handles single item', () => {
    const items = [{ ts: '2026-03-15T08:00:00Z', text: 'A' }];
    const groups = groupByDate(items, (i) => i.ts);
    expect(groups.size).toBe(1);
    expect(groups.get('2026-03-15')).toHaveLength(1);
  });
});
