import { describe, it, expect } from 'vitest';
import {
  calibrateFromOutcomes,
  BASE_SOFT_FLOOR_MINS,
  evidenceWeight,
  learningPhaseFromCount,
} from '@/lib/thinking/calibration';
import type { PredictionLogEntry } from '@/lib/thinking/types';

function entry(partial: {
  suggested_mins: number;
  actual_mins: number;
  estimated_mins?: number;
}): PredictionLogEntry {
  return {
    user_id: 'u1',
    task_text: 'task',
    cluster_label: null,
    cluster_count: 0,
    estimated_mins: partial.estimated_mins ?? 30,
    suggested_mins: partial.suggested_mins,
    confidence: 'low',
    actual_mins: partial.actual_mins,
    logged_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  };
}

describe('learningPhaseFromCount', () => {
  it('maps sample counts to phases', () => {
    expect(learningPhaseFromCount(0)).toBe('prior');
    expect(learningPhaseFromCount(1)).toBe('prior');
    expect(learningPhaseFromCount(2)).toBe('early');
    expect(learningPhaseFromCount(3)).toBe('early');
    expect(learningPhaseFromCount(4)).toBe('forming');
    expect(learningPhaseFromCount(5)).toBe('established');
  });
});

describe('evidenceWeight', () => {
  it('ramps from zero', () => {
    expect(evidenceWeight(0)).toBe(0);
    expect(evidenceWeight(1)).toBe(0);
    expect(evidenceWeight(2)).toBe(0.25);
    expect(evidenceWeight(5)).toBe(1);
  });
});

describe('calibrateFromOutcomes', () => {
  it('returns prior phase with few samples', () => {
    const cal = calibrateFromOutcomes([
      entry({ suggested_mins: 30, actual_mins: 40 }),
    ]);
    expect(cal.phase).toBe('prior');
    expect(cal.softFloorMins).toBe(BASE_SOFT_FLOOR_MINS);
    expect(cal.blendScale).toBe(1);
    expect(cal.explain).toBeNull();
  });

  it('starts dampened learning at 2 samples', () => {
    const cal = calibrateFromOutcomes([
      entry({ suggested_mins: 30, actual_mins: 45, estimated_mins: 10 }),
      entry({ suggested_mins: 30, actual_mins: 50, estimated_mins: 10 }),
    ]);
    expect(cal.phase).toBe('early');
    expect(cal.sampleCount).toBe(2);
    expect(cal.softFloorMins).toBeGreaterThanOrEqual(15);
    expect(cal.softFloorMins).toBeLessThanOrEqual(45);
  });

  it('raises blend scale when actuals exceed suggestions (established)', () => {
    const entries = Array.from({ length: 8 }, () =>
      entry({ suggested_mins: 30, actual_mins: 45 })
    );
    const cal = calibrateFromOutcomes(entries);
    expect(cal.blendScale).toBeGreaterThan(1);
    expect(cal.sampleCount).toBe(8);
    expect(cal.phase).toBe('established');
    expect(cal.explain).toMatch(/short/i);
  });
});
