import { describe, expect, it } from 'vitest';
import {
  CALENDAR_SYNC_MIN_INTERVAL_MS,
  shouldSkipCalendarSync,
} from '@/lib/calendar/syncPolicy';

describe('shouldSkipCalendarSync', () => {
  const now = Date.parse('2026-10-15T12:00:00.000Z');

  it('allows the first sync when no successful sync is recorded', () => {
    expect(shouldSkipCalendarSync(null, now)).toBe(false);
  });

  it('throttles a recent background sync', () => {
    const lastSyncAt = new Date(now - CALENDAR_SYNC_MIN_INTERVAL_MS + 1000).toISOString();
    expect(shouldSkipCalendarSync(lastSyncAt, now)).toBe(true);
  });

  it('allows a sync after the throttle interval', () => {
    const lastSyncAt = new Date(now - CALENDAR_SYNC_MIN_INTERVAL_MS - 1).toISOString();
    expect(shouldSkipCalendarSync(lastSyncAt, now)).toBe(false);
  });

  it('allows an explicit forced sync inside the throttle interval', () => {
    const lastSyncAt = new Date(now - 1000).toISOString();
    expect(shouldSkipCalendarSync(lastSyncAt, now, true)).toBe(false);
  });

  it('does not throttle on an invalid timestamp', () => {
    expect(shouldSkipCalendarSync('not-a-date', now)).toBe(false);
  });
});
