import { describe, it, expect } from 'vitest';
import { calibrateFromOutcomes, BASE_SOFT_FLOOR_MINS } from '@/lib/thinking/calibration';
import type { PredictionLogEntry } from '@/lib/thinking/types';

function entry(
  partial: Partial<PredictionLogEntry> & { suggested_mins: number; actual_mins: number }
): PredictionLogEntry {
  return {
    user_id: 'u1',
    task_text: 'x',
    cluster_label: 'x',
    cluster_count: 5,
    estimated_mins: 30,
    confidence: 'medium',
    logged_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    ...partial,
  };
}

describe('calibrateFromOutcomes', () => {
  it('returns defaults with few samples', () => {
    const cal = calibrateFromOutcomes([
      entry({ suggested_mins: 30, actual_mins: 40 }),
    ]);
    expect(cal.softFloorMins).toBe(BASE_SOFT_FLOOR_MINS);
    expect(cal.blendScale).toBe(1);
    expect(cal.explain).toBeNull();
  });

  it('raises blend scale when actuals exceed suggestions', () => {
    const entries = Array.from({ length: 8 }, () =>
      entry({ suggested_mins: 30, actual_mins: 45 })
    );
    const cal = calibrateFromOutcomes(entries);
    expect(cal.blendScale).toBeGreaterThan(1);
    expect(cal.sampleCount).toBe(8);
    expect(cal.explain).toMatch(/short/i);
  });
});
