import { describe, it, expect } from 'vitest';
import {
  buildDayCommitments,
  remainingTaskCapacityMins,
  minsToNextCommitment,
} from '../planning';

function at(h: number, m = 0): Date {
  return new Date(2026, 2, 15, h, m, 0, 0);
}

describe('buildDayCommitments', () => {
  it('merges calendar events and timed manual meetings', () => {
    const list = buildDayCommitments({
      calendarEvents: [
        { start_at: at(10).toISOString(), end_at: at(11).toISOString() },
      ],
      meetings: [
        {
          start_time: at(14).toISOString(),
          duration_mins: 30,
          source: 'manual',
        },
        {
          start_time: at(15).toISOString(),
          duration_mins: 60,
          source: 'outlook',
        },
        { start_time: null, duration_mins: 45, source: 'manual' },
      ],
    });
    expect(list).toHaveLength(2);
    expect(list[0].start.getHours()).toBe(10);
    expect(list[1].start.getHours()).toBe(14);
  });
});

describe('remainingTaskCapacityMins', () => {
  it('subtracts flat blocked mins from available', () => {
    const mins = remainingTaskCapacityMins({
      now: at(9),
      workStartMins: 9 * 60,
      workEndMins: 17 * 60,
      isWorkDay: true,
      commitments: [{ start: at(10), end: at(11) }],
      flatBlockedMins: 30,
    });
    // 8h window = 480, 60 blocked meeting, 30 flat → 390
    expect(mins).toBe(390);
  });
});

describe('minsToNextCommitment with buildDayCommitments', () => {
  it('finds next start after now', () => {
    const c = buildDayCommitments({
      calendarEvents: [
        { start_at: at(14).toISOString(), end_at: at(15).toISOString() },
      ],
    });
    expect(minsToNextCommitment(at(10), c)).toBe(240);
  });
});
