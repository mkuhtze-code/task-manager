import { describe, it, expect } from 'vitest';
import {
  detectRegimeShift,
  regimeAwareExpectedMins,
  timedSamplesFromHistory,
} from '../regime';
import {
  calibrationProgression,
  fitRegretRate,
  type TimedCalibrationPair,
} from '../calibrationHarness';

function day(offset: number): string {
  const d = new Date('2026-01-01T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString();
}

describe('FP-3 regime detection', () => {
  it('detects upward shift after sustained short then long work', () => {
    const samples = [
      ...Array.from({ length: 6 }, (_, i) => ({
        mins: 20,
        completedAt: day(i),
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        mins: 45,
        completedAt: day(10 + i),
      })),
    ];
    const r = detectRegimeShift(samples);
    expect(r.shifted).toBe(true);
    expect(r.direction).toBe('up');
    expect(r.preShiftWeight).toBeLessThan(1);
  });

  it('does not shift on stable leaf', () => {
    const samples = Array.from({ length: 12 }, (_, i) => ({
      mins: 30 + (i % 3),
      completedAt: day(i),
    }));
    const r = detectRegimeShift(samples);
    expect(r.shifted).toBe(false);
    expect(r.preShiftWeight).toBe(1);
  });

  it('regimeAwareExpectedMins leans recent after shift', () => {
    const samples = [
      ...Array.from({ length: 6 }, (_, i) => ({
        mins: 15,
        completedAt: day(i),
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        mins: 50,
        completedAt: day(10 + i),
      })),
    ];
    const { expectedMins } = regimeAwareExpectedMins(samples);
    expect(expectedMins).not.toBeNull();
    expect(expectedMins!).toBeGreaterThan(25);
  });

  it('timedSamplesFromHistory drops non-positive', () => {
    const t = timedSamplesFromHistory([
      { actual_mins: 10, completed_at: day(0) },
      { actual_mins: 0, completed_at: day(1) },
      { actual_mins: 12, completed_at: null },
    ]);
    expect(t).toHaveLength(1);
  });
});

describe('FP-3 calibration harness', () => {
  it('windows pairs by horizon', () => {
    const pairs: TimedCalibrationPair[] = [];
    for (let i = 0; i < 30; i++) {
      pairs.push({
        predictedMins: 30,
        actualMins: 30 + (i < 10 ? 10 : 2),
        completedAt: day(i),
      });
    }
    const prog = calibrationProgression(pairs, day(29));
    expect(prog.day7.pairCount).toBeLessThanOrEqual(prog.day30.pairCount);
    expect(prog.day14.horizonDays).toBe(14);
  });

  it('fitRegretRate returns null when sparse', () => {
    expect(fitRegretRate([{ predictedMins: 10, actualMins: 12 }])).toBeNull();
  });
});
