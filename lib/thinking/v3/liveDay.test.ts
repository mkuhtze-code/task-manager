import { describe, it, expect } from 'vitest';
import { freeWindowsMins, largestWindowMins } from './liveDay';

describe('freeWindowsMins', () => {
  it('returns full remainder when no commitments', () => {
    const now = new Date();
    now.setHours(9, 0, 0, 0);
    const windows = freeWindowsMins(now, 17 * 60, []);
    expect(largestWindowMins(windows)).toBe(8 * 60);
  });

  it('splits around a midday meeting', () => {
    const now = new Date();
    now.setHours(9, 0, 0, 0);
    const meetingStart = new Date(now);
    meetingStart.setHours(11, 0, 0, 0);
    const meetingEnd = new Date(now);
    meetingEnd.setHours(12, 0, 0, 0);
    const windows = freeWindowsMins(now, 17 * 60, [
      { start: meetingStart, end: meetingEnd },
    ]);
    expect(windows.length).toBeGreaterThanOrEqual(2);
    expect(largestWindowMins(windows)).toBe(5 * 60); // 12:00–17:00
  });
});
