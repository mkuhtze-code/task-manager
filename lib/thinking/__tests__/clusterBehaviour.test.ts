// lib/thinking/__tests__/clusterBehaviour.test.ts
import { describe, it, expect } from 'vitest';
import { observeClusterBehaviour } from '../observations/clusterBehaviour';
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

describe('observeClusterBehaviour', () => {
  it('returns null for empty array', () => {
    expect(observeClusterBehaviour([], 'cluster')).toBeNull();
  });

  it('computes all rates for a cluster', () => {
    const tasks = [
      makeTask({
        actual_mins: 30,
        location_text: 'Henderson',
        job_id: 'job-1',
        source: 'came_up',
        subtaskCount: 3,
        completed_at: '2026-01-10T09:00:00Z',
      }),
      makeTask({
        actual_mins: 60,
        location_text: null,
        job_id: null,
        source: 'planned',
        subtaskCount: 0,
        completed_at: '2026-01-10T10:00:00Z',
      }),
    ];
    const obs = observeClusterBehaviour(tasks, 'quote reroof')!;
    expect(obs.clusterLabel).toBe('quote reroof');
    expect(obs.count).toBe(2);
    expect(obs.avgMins).toBe(45);
    expect(obs.sameDayRate).toBe(1); // both completed same day
    expect(obs.decomposeRate).toBe(0.5);
    expect(obs.locatedRate).toBe(0.5);
    expect(obs.jobRate).toBe(0.5);
    expect(obs.cameUpRate).toBe(0.5);
    expect(obs.avgSubtaskCount).toBe(1.5);
  });

  it('computes carryover correctly', () => {
    const tasks = [
      makeTask({
        created_at: '2026-01-10T08:00:00Z',
        completed_at: '2026-01-11T08:00:00Z', // next day
      }),
      makeTask({
        created_at: '2026-01-10T08:00:00Z',
        completed_at: '2026-01-10T09:00:00Z', // same day
      }),
    ];
    const obs = observeClusterBehaviour(tasks, 'task')!;
    expect(obs.sameDayRate).toBe(0.5);
  });
});
