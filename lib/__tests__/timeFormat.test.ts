import { describe, it, expect } from 'vitest';
import {
  localDateStr,
  parseMins,
  fmtMins,
  minsToInput,
  fmtClock,
  timeStringToMinutes,
  fmtSurfaceDate,
  isScheduledForLater,
} from '../timeFormat';
import type { Task } from '../taskTypes';

function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    text: 'Test task',
    status: 'pending',
    source: 'planned',
    estimate_mins: 30,
    logged_mins: 0,
    started_at: null,
    due_today: false,
    order_index: 0,
    created_at: '2026-01-01T10:00:00Z',
    surface_date: null,
    location_text: null,
    lat: null,
    lng: null,
    drive_mins_to_next: 0,
    route_polyline: null,
    info: '',
    job_id: null,
    ...overrides,
  };
}

describe('timeFormat', () => {
  describe('localDateStr', () => {
    it('formats a Date object into YYYY-MM-DD local date string', () => {
      const d = new Date(2026, 7, 25); // August 25, 2026 local time
      expect(localDateStr(d)).toBe('2026-08-25');
    });

    it('pads single-digit months and days with leading zeros', () => {
      const d = new Date(2026, 0, 5); // January 5, 2026 local time
      expect(localDateStr(d)).toBe('2026-01-05');
    });
  });

  describe('parseMins', () => {
    it('returns 0 for empty string or whitespace', () => {
      expect(parseMins('')).toBe(0);
      expect(parseMins('   ')).toBe(0);
    });

    it('parses plain minute numbers or "m" suffix', () => {
      expect(parseMins('15')).toBe(15);
      expect(parseMins('45m')).toBe(45);
      expect(parseMins('  30m  ')).toBe(30);
      expect(parseMins('0m')).toBe(0);
    });

    it('parses hour values with "h" suffix', () => {
      expect(parseMins('1h')).toBe(60);
      expect(parseMins('2.5h')).toBe(150);
      expect(parseMins('0.5h')).toBe(30);
    });

    it('rounds float results to nearest minute', () => {
      expect(parseMins('15.4m')).toBe(15);
      expect(parseMins('15.6m')).toBe(16);
      expect(parseMins('1.33h')).toBe(80); // 1.33 * 60 = 79.8 -> 80
    });

    it('returns null for invalid non-numeric inputs', () => {
      expect(parseMins('abc')).toBeNull();
      expect(parseMins('xyz-m')).toBeNull();
      expect(parseMins('h')).toBeNull();
    });
  });

  describe('fmtMins', () => {
    it('formats minutes under 60 as "Xm"', () => {
      expect(fmtMins(0)).toBe('0m');
      expect(fmtMins(15)).toBe('15m');
      expect(fmtMins(59)).toBe('59m');
    });

    it('formats exact hour counts as "Xh"', () => {
      expect(fmtMins(60)).toBe('1h');
      expect(fmtMins(120)).toBe('2h');
      expect(fmtMins(180)).toBe('3h');
    });

    it('formats mixed hours and minutes as "Xh Ym"', () => {
      expect(fmtMins(61)).toBe('1h 1m');
      expect(fmtMins(90)).toBe('1h 30m');
      expect(fmtMins(145)).toBe('2h 25m');
    });

    it('rounds floating-point input before formatting', () => {
      expect(fmtMins(59.6)).toBe('1h');
      expect(fmtMins(89.4)).toBe('1h 29m');
    });
  });

  describe('minsToInput', () => {
    it('returns "0m" for 0 or negative values', () => {
      expect(minsToInput(0)).toBe('0m');
      expect(minsToInput(-10)).toBe('0m');
    });

    it('returns hour string "Xh" for exact multiples of 60', () => {
      expect(minsToInput(60)).toBe('1h');
      expect(minsToInput(120)).toBe('2h');
    });

    it('returns minute string "Xm" for non-multiples of 60', () => {
      expect(minsToInput(15)).toBe('15m');
      expect(minsToInput(90)).toBe('90m');
    });
  });

  describe('fmtClock', () => {
    it('formats morning times (AM) without trailing :00 when minutes are 0', () => {
      expect(fmtClock('08:00')).toBe('8a');
      expect(fmtClock('09:30')).toBe('9:30a');
    });

    it('formats afternoon times (PM)', () => {
      expect(fmtClock('13:00')).toBe('1p');
      expect(fmtClock('15:45')).toBe('3:45p');
    });

    it('handles midnight (00:00) and noon (12:00) boundary values', () => {
      expect(fmtClock('00:00')).toBe('12a');
      expect(fmtClock('00:15')).toBe('12:15a');
      expect(fmtClock('12:00')).toBe('12p');
      expect(fmtClock('12:30')).toBe('12:30p');
    });
  });

  describe('timeStringToMinutes', () => {
    it('converts HH:MM strings to total minutes from midnight', () => {
      expect(timeStringToMinutes('00:00')).toBe(0);
      expect(timeStringToMinutes('08:30')).toBe(510);
      expect(timeStringToMinutes('14:15')).toBe(855);
      expect(timeStringToMinutes('23:59')).toBe(1439);
    });
  });

  describe('fmtSurfaceDate', () => {
    it('formats YYYY-MM-DD date strings into short local date display', () => {
      const formatted = fmtSurfaceDate('2026-08-25');
      // e.g., "Tue, Aug 25" depending on local locale
      expect(formatted).toContain('Aug');
      expect(formatted).toContain('25');
    });
  });

  describe('isScheduledForLater', () => {
    const todayStr = '2026-08-25';

    it('returns false for tasks with null surface_date', () => {
      const t = createMockTask({ surface_date: null });
      expect(isScheduledForLater(t, todayStr)).toBe(false);
    });

    it('returns false for tasks scheduled for today or past dates', () => {
      const tToday = createMockTask({ surface_date: '2026-08-25' });
      const tPast = createMockTask({ surface_date: '2026-08-20' });

      expect(isScheduledForLater(tToday, todayStr)).toBe(false);
      expect(isScheduledForLater(tPast, todayStr)).toBe(false);
    });

    it('returns true for tasks scheduled for future dates', () => {
      const tFuture = createMockTask({ surface_date: '2026-08-26' });
      expect(isScheduledForLater(tFuture, todayStr)).toBe(true);
    });

    it('normalizes PostgreSQL date-time strings to YYYY-MM-DD before comparing', () => {
      // "2026-08-25T14:30:00Z" should normalize to "2026-08-25" and return false for today
      const tDateTimeToday = createMockTask({ surface_date: '2026-08-25T14:30:00Z' });
      expect(isScheduledForLater(tDateTimeToday, todayStr)).toBe(false);

      const tDateTimeFuture = createMockTask({ surface_date: '2026-08-28T09:00:00Z' });
      expect(isScheduledForLater(tDateTimeFuture, todayStr)).toBe(true);
    });

    it('returns false for invalid non-date surface_date strings', () => {
      const tInvalid = createMockTask({ surface_date: 'invalid-date' });
      expect(isScheduledForLater(tInvalid, todayStr)).toBe(false);
    });
  });
});
