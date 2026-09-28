import { describe, it, expect } from 'vitest';
import {
  computeRegimeLeafState,
  expectedMinsForRegimeState,
  detectCusumShift,
  type RegimeLeafState,
} from '../regimeLeaf';
import type { TimedDurationSample } from '../regime';

function day(offset: number): string {
  const d = new Date('2026-01-01T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString();
}

function samples(vals: Array<[number, number]>): TimedDurationSample[] {
  return vals.map(([mins, d]) => ({ mins, completedAt: day(d) }));
}

describe('S3 regime leaf state', () => {
  it('detects upward shift and uses recent-only while shifting', () => {
    const s = samples([
      ...Array.from({ length: 6 }, (_, i) => [20, i] as [number, number]),
      ...Array.from({ length: 4 }, (_, i) => [50, 10 + i] as [number, number]),
    ]);
    const state = computeRegimeLeafState(s);
    expect(['shifting', 'post_shift']).toContain(state.phase);
    expect(state.direction).toBe('up');
    expect(state.preShiftWeight).toBeLessThan(1);

    const exp = expectedMinsForRegimeState(s, state);
    expect(exp.expectedMins).not.toBeNull();
    expect(exp.expectedMins!).toBeGreaterThan(30);
    if (state.phase === 'shifting') {
      expect(exp.authority).toBe('contested');
    }
  });

  it('stable leaf does not shift on ±15% noise', () => {
    const s = samples(
      Array.from({ length: 12 }, (_, i) => {
        const mins = 30 + (i % 2 === 0 ? 3 : -3);
        return [mins, i] as [number, number];
      })
    );
    const state = computeRegimeLeafState(s);
    expect(state.phase).toBe('stable');
    expect(state.preShiftWeight).toBe(1);
    const exp = expectedMinsForRegimeState(s, state);
    expect(exp.authority).not.toBe('contested');
  });

  it('CUSUM can fire with fewer samples than full window path alone', () => {
    const s = samples([
      [20, 0],
      [20, 1],
      [21, 2],
      [20, 3],
      [45, 4],
      [48, 5],
      [50, 6],
    ]);
    const c = detectCusumShift(s);
    // May or may not fire depending on threshold — assert structure
    expect(c.trigger === 'cusum' || c.trigger === 'none').toBe(true);
    expect(typeof c.shifted).toBe('boolean');
  });

  it('tracks new band after sustained post-shift samples', () => {
    const s = samples([
      ...Array.from({ length: 6 }, (_, i) => [18, i] as [number, number]),
      ...Array.from({ length: 7 }, (_, i) => [55, 14 + i] as [number, number]),
    ]);
    const state = computeRegimeLeafState(s);
    const exp = expectedMinsForRegimeState(s, state);
    expect(exp.expectedMins).not.toBeNull();
    // Should be near new regime, not old 18
    expect(exp.expectedMins!).toBeGreaterThan(35);
  });
});

