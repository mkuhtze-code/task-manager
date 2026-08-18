// lib/thinking/__tests__/userPatterns.test.ts
import { describe, it, expect } from 'vitest';
import { buildUserPatterns } from '../compose/userPatterns';
import type { CompletedTaskFacts } from '../types';

function makeTask(overrides: Partial<CompletedTaskFacts> = {}): CompletedTaskFacts {
  return {
    text: 'task',
    status: 'done',
    source: 'planned',
    estimate_mins: 30,
    actual_mins: 30,
    logged_mins: 30,
    created_at: '2026-01-10T08:00:00Z',
    completed_at: '2026-01-10T09:00:00Z',
    started_at: null,
    surface_date: null,
    location_text: null,
    lat: null,
    lng: null,
    job_id: null,
    info: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    subtaskTotalMins: 0,
    ...overrides,
  };
}

describe('buildUserPatterns', () => {
  it('returns null for empty array', () => {
    expect(buildUserPatterns([])).toBeNull();
  });

  it('computes all rates correctly', () => {
    const tasks = [
      makeTask({
        source: 'came_up',
        estimate_mins: 30,
        actual_mins: 30,
        surface_date: '2026-01-15',
        location_text: 'Henderson',
        job_id: 'job-1',
        subtaskCount: 2,
        info: 'notes',
        logged_mins: 15,
      }),
      makeTask({
        source: 'planned',
        estimate_mins: 0,
        actual_mins: null,
        surface_date: null,
        location_text: null,
        job_id: null,
        subtaskCount: 0,
        info: '',
        logged_mins: 0,
      }),
    ];
    const patterns = buildUserPatterns(tasks)!;
    expect(patterns.totalCompleted).toBe(2);
    expect(patterns.cameUpRate).toBe(0.5);
    expect(patterns.estimatedRate).toBe(0.5);
    expect(patterns.scheduledRate).toBe(0.5);
    expect(patterns.locatedRate).toBe(0.5);
    expect(patterns.jobAttachedRate).toBe(0.5);
    expect(patterns.subtaskUsageRate).toBe(0.5);
    expect(patterns.infoUsageRate).toBe(0.5);
    expect(patterns.timerUsageRate).toBe(0.5);
  });

  it('computes estimate accuracy', () => {
    const tasks = [
      makeTask({ estimate_mins: 30, actual_mins: 60 }), // 2x over
      makeTask({ estimate_mins: 30, actual_mins: 15 }), // 0.5x under
    ];
    const patterns = buildUserPatterns(tasks)!;
    // (2.0 + 0.5) / 2 = 1.25
    expect(patterns.avgEstimateAccuracy).toBeCloseTo(1.25);
  });

  it('returns 1.0 accuracy when no tasks have both estimate and actual', () => {
    const tasks = [
      makeTask({ estimate_mins: 30, actual_mins: null }),
    ];
    const patterns = buildUserPatterns(tasks)!;
    expect(patterns.avgEstimateAccuracy).toBe(1);
  });
});
