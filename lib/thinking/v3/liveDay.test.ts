import { describe, it, expect } from 'vitest';
import {
  freeWindows,
  freeWindowsMins,
  largestWindowMins,
  packOrderedIntoWindows,
} from './liveDay';

function at(h: number, m = 0): Date {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  d.setMilliseconds(0);
  return d;
}

describe('freeWindows', () => {
  it('returns full remainder when no commitments', () => {
    const now = at(9);
    const windows = freeWindows(now, 17 * 60, []);
    expect(windows.length).toBe(1);
    expect(windows[0].mins).toBe(8 * 60);
    expect(largestWindowMins(windows)).toBe(8 * 60);
  });

  it('splits around a midday meeting and merges overlap', () => {
    const now = at(9);
    const windows = freeWindows(now, 17 * 60, [
      { start: at(11), end: at(12) },
      { start: at(11, 30), end: at(12, 30) }, // overlaps → one busy 11:00–12:30
    ]);
    expect(windows.length).toBe(2);
    expect(windows[0].mins).toBe(2 * 60); // 09:00–11:00
    expect(windows[1].mins).toBe(Math.round(4.5 * 60)); // 12:30–17:00
    expect(largestWindowMins(windows)).toBe(windows[1].mins);
  });

  it('freeWindowsMins matches lengths', () => {
    const now = at(9);
    const lengths = freeWindowsMins(now, 17 * 60, [
      { start: at(11), end: at(12) },
    ]);
    expect(lengths).toEqual([2 * 60, 5 * 60]);
  });
});

describe('packOrderedIntoWindows', () => {
  it('places tasks in order into earliest feasible window', () => {
    const windows = [
      { startMs: 0, endMs: 60 * 60000, mins: 60 },
      { startMs: 120 * 60000, endMs: 300 * 60000, mins: 180 },
    ];
    const pack = packOrderedIntoWindows(
      [
        { id: 'a', costMins: 45 },
        { id: 'b', costMins: 90 },
        { id: 'c', costMins: 30 },
      ],
      windows
    );
    expect(pack.placedIds).toEqual(['a', 'b', 'c']);
    expect(pack.overflowIds).toEqual([]);
    expect(pack.placed[0].windowIndex).toBe(0);
    expect(pack.placed[1].windowIndex).toBe(1);
    expect(pack.placed[2].windowIndex).toBe(1);
  });

  it('overflows when no contiguous block is large enough', () => {
    // Σ free = 90, but max contiguous = 50 → 70m task cannot fit
    const windows = [
      { startMs: 0, endMs: 50 * 60000, mins: 50 },
      { startMs: 100 * 60000, endMs: 140 * 60000, mins: 40 },
    ];
    const pack = packOrderedIntoWindows(
      [
        { id: 'long', costMins: 70 },
        { id: 'short', costMins: 30 },
      ],
      windows
    );
    expect(pack.overflowIds).toContain('long');
    expect(pack.placedIds).toContain('short');
  });

  it('zero-cost items do not consume windows', () => {
    const windows = [{ startMs: 0, endMs: 30 * 60000, mins: 30 }];
    const pack = packOrderedIntoWindows(
      [
        { id: 'list', costMins: 0 },
        { id: 'timed', costMins: 25 },
      ],
      windows
    );
    expect(pack.overflowIds).toEqual([]);
    expect(pack.placedIds).toEqual(['list', 'timed']);
  });

  it('preserves order: earlier small task can block a later large one in a tight window', () => {
    const windows = [{ startMs: 0, endMs: 60 * 60000, mins: 60 }];
    const pack = packOrderedIntoWindows(
      [
        { id: 'first', costMins: 40 },
        { id: 'second', costMins: 40 },
      ],
      windows
    );
    expect(pack.placedIds).toContain('first');
    expect(pack.overflowIds).toContain('second');
  });
});
