import { describe, expect, it } from 'vitest';
import {
  computeAvailability,
  isCommitmentActive,
  mergeCommitmentIntervals,
} from '@/lib/calendar/planning';

const WORK_START = 8 * 60;
const WORK_END = 16 * 60;

function at(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 8, day, hour, minute);
}

// commitment(day, fromHour, fromMin, toHour, toMin)
function commitment(
  day: number,
  fromHour: number,
  fromMin: number,
  toHour: number,
  toMin = 0
) {
  return { start: at(day, fromHour, fromMin), end: at(day, toHour, toMin) };
}

describe('computeAvailability - external commitment capacity', () => {
  it('returns the whole remaining workday with no commitments', () => {
    const result = computeAvailability({
      now: at(8, 9, 0),
      workStartMins: WORK_START,
      workEndMins: WORK_END,
      isWorkDay: true,
      commitments: [],
    });
    expect(result.availableMinutes).toBe(7 * 60);
    expect(result.blockedMinutes).toBe(0);
  });

  it('blocks a commitment inside the workday window', () => {
    const result = computeAvailability({
      now: at(8, 9, 0),
      workStartMins: WORK_START,
      workEndMins: WORK_END,
      isWorkDay: true,
      commitments: [commitment(8, 10, 0, 12, 0)],
    });
    expect(result.blockedMinutes).toBe(120);
    expect(result.availableMinutes).toBe(7 * 60 - 120);
  });

  it('does not block a commitment that already ended', () => {
    const result = computeAvailability({
      now: at(8, 9, 0),
      workStartMins: WORK_START,
      workEndMins: WORK_END,
      isWorkDay: true,
      commitments: [commitment(8, 7, 0, 8, 30)],
    });
    expect(result.blockedMinutes).toBe(0);
    expect(result.availableMinutes).toBe(7 * 60);
  });

  it('blocks only the overlap when a commitment runs past workday end', () => {
    const result = computeAvailability({
      now: at(8, 9, 0),
      workStartMins: WORK_START,
      workEndMins: WORK_END,
      isWorkDay: true,
      commitments: [commitment(8, 15, 0, 17, 0)],
    });
    expect(result.blockedMinutes).toBe(60);
  });

  it('does not block a commitment after the workday', () => {
    const result = computeAvailability({
      now: at(8, 9, 0),
      workStartMins: WORK_START,
      workEndMins: WORK_END,
      isWorkDay: true,
      commitments: [commitment(8, 17, 0, 18, 0)],
    });
    expect(result.blockedMinutes).toBe(0);
  });

  it('clips to "now" for a commitment that started before the current time', () => {
    const result = computeAvailability({
      now: at(8, 9, 0),
      workStartMins: WORK_START,
      workEndMins: WORK_END,
      isWorkDay: true,
      commitments: [commitment(8, 8, 0, 11, 0)],
    });
    expect(result.blockedMinutes).toBe(120);
  });

  it('merges overlapping commitments without double counting', () => {
    const result = computeAvailability({
      now: at(8, 9, 0),
      workStartMins: WORK_START,
      workEndMins: WORK_END,
      isWorkDay: true,
      commitments: [commitment(8, 10, 0, 12, 0), commitment(8, 10, 30, 13, 0)],
    });
    expect(result.blockedMinutes).toBe(180);
  });

  it('merges adjacent commitments into one block', () => {
    const result = computeAvailability({
      now: at(8, 9, 0),
      workStartMins: WORK_START,
      workEndMins: WORK_END,
      isWorkDay: true,
      commitments: [commitment(8, 10, 0, 11, 0), commitment(8, 11, 0, 12, 0)],
    });
    expect(result.blockedMinutes).toBe(120);
  });

  it('sums multiple separated commitments', () => {
    const result = computeAvailability({
      now: at(8, 9, 0),
      workStartMins: WORK_START,
      workEndMins: WORK_END,
      isWorkDay: true,
      commitments: [commitment(8, 9, 30, 10, 0), commitment(8, 13, 0, 14, 0)],
    });
    expect(result.blockedMinutes).toBe(90);
    expect(result.availableMinutes).toBe(7 * 60 - 90);
  });

  it('an all-day event blocks the whole remaining workday', () => {
    const result = computeAvailability({
      now: at(8, 9, 0),
      workStartMins: WORK_START,
      workEndMins: WORK_END,
      isWorkDay: true,
      commitments: [commitment(8, 0, 0, 24, 0)],
    });
    expect(result.blockedMinutes).toBe(7 * 60);
    expect(result.availableMinutes).toBe(0);
  });

  it('returns zero on a non-work day regardless of commitments', () => {
    const result = computeAvailability({
      now: at(8, 9, 0),
      workStartMins: WORK_START,
      workEndMins: WORK_END,
      isWorkDay: false,
      commitments: [commitment(8, 10, 0, 12, 0)],
    });
    expect(result.availableMinutes).toBe(0);
    expect(result.blockedMinutes).toBe(0);
  });

  it('returns zero once the workday has ended', () => {
    const result = computeAvailability({
      now: at(8, 17, 0),
      workStartMins: WORK_START,
      workEndMins: WORK_END,
      isWorkDay: true,
      commitments: [commitment(8, 14, 0, 16, 0)],
    });
    expect(result.availableMinutes).toBe(0);
    expect(result.blockedMinutes).toBe(0);
  });

  it('a commitment that ends exactly at the workday end still blocks', () => {
    const result = computeAvailability({
      now: at(8, 9, 0),
      workStartMins: WORK_START,
      workEndMins: WORK_END,
      isWorkDay: true,
      commitments: [commitment(8, 14, 0, 16, 0)],
    });
    expect(result.blockedMinutes).toBe(120);
  });
});

describe('computeAvailability - calendar selection', () => {
  // The exact acceptance scenario: 08:00–16:00 workday, a 10:00–12:00 event
  // on a SELECTED calendar and a 13:00–14:00 event on a DESELECTED calendar.
  // Sync only ever hands Today events from selected calendars, so the
  // deselected 13:00–14:00 Dentist appointment must not consume capacity.
  it('only selected-calendar events reduce available capacity', () => {
    const base = {
      now: at(8, 8, 0),
      workStartMins: WORK_START,
      workEndMins: WORK_END,
      isWorkDay: true as const,
    };
    const withBoth = computeAvailability({
      ...base,
      commitments: [commitment(8, 10, 0, 12, 0), commitment(8, 13, 0, 14, 0)],
    });
    expect(withBoth.blockedMinutes).toBe(180); // 10-12 and 13-14 both block

    // Deselected calendar is not in the commitments list → only 10-12 blocks.
    const selectedOnly = computeAvailability({
      ...base,
      commitments: [commitment(8, 10, 0, 12, 0)],
    });
    expect(selectedOnly.blockedMinutes).toBe(120);
    expect(selectedOnly.availableMinutes).toBe(6 * 60); // 08:00–10:00 + 12:00–16:00
  });

  it('multiple selected calendars merge and only selected events count', () => {
    const result = computeAvailability({
      now: at(8, 8, 0),
      workStartMins: WORK_START,
      workEndMins: WORK_END,
      isWorkDay: true,
      commitments: [
        // Selected work calendar
        commitment(8, 10, 0, 12, 0),
        // Selected team calendar — overlaps the work block
        commitment(8, 11, 0, 13, 0),
      ],
    });
    expect(result.blockedMinutes).toBe(180); // merged 10:00–13:00
    expect(result.availableMinutes).toBe(300); // 8h − 3h
  });
});

describe('isCommitmentActive', () => {
  it('an ended commitment is not active', () => {
    expect(isCommitmentActive(commitment(8, 10, 0, 11, 0), at(8, 13))).toBe(false);
  });

  it('a current or upcoming commitment is active', () => {
    expect(isCommitmentActive(commitment(8, 10, 0, 13, 0), at(8, 11))).toBe(true);
    expect(isCommitmentActive(commitment(8, 14, 0, 15, 0), at(8, 11))).toBe(true);
  });
});

describe('mergeCommitmentIntervals', () => {
  it('merges adjacent and overlapping intervals', () => {
    const merged = mergeCommitmentIntervals([
      commitment(8, 10, 0, 11, 0),
      commitment(8, 11, 0, 12, 0),
      commitment(8, 12, 30, 13, 0),
      commitment(8, 15, 0, 16, 0),
    ]);
    expect(merged).toHaveLength(3);
    expect(merged[0].start).toEqual(at(8, 10));
    expect(merged[0].end).toEqual(at(8, 12));
    expect(merged[1].start).toEqual(at(8, 12, 30));
    expect(merged[1].end).toEqual(at(8, 13));
    expect(merged[2].start).toEqual(at(8, 15));
    expect(merged[2].end).toEqual(at(8, 16));
  });

  it('merges a fully-overlapping interval with no double count', () => {
    const merged = mergeCommitmentIntervals([
      commitment(8, 10, 0, 12, 0),
      commitment(8, 11, 0, 13, 0),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toEqual(at(8, 10));
    expect(merged[0].end).toEqual(at(8, 13));
  });

  it('drops zero-length and inverted commitments', () => {
    const merged = mergeCommitmentIntervals([
      { start: at(8, 12), end: at(8, 12) },
      { start: at(8, 14), end: at(8, 13) },
      commitment(8, 15, 0, 16, 0),
    ]);
    expect(merged).toHaveLength(1);
  });
});