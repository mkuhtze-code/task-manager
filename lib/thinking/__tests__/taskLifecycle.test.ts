// lib/thinking/__tests__/taskLifecycle.test.ts
import { describe, it, expect } from 'vitest';
import { observeLifecycle, observeClusterLifecycle } from '../observations/taskLifecycle';
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

describe('observeLifecycle', () => {
  it('returns null for empty array', () => {
    expect(observeLifecycle([])).toBeNull();
  });

  it('computes same-day completion', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-10T08:00:00Z', completed_at: '2026-01-10T17:00:00Z' }),
    ];
    const obs = observeLifecycle(tasks)!;
    expect(obs.sameDayRate).toBe(1);
    expect(obs.carryoverRate).toBe(0);
  });

  it('computes carryover for next-day completion', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-10T08:00:00Z', completed_at: '2026-01-11T08:00:00Z' }),
    ];
    const obs = observeLifecycle(tasks)!;
    expect(obs.sameDayRate).toBe(0);
    expect(obs.carryoverRate).toBe(1);
  });

  it('computes average days to completion', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-10T08:00:00Z', completed_at: '2026-01-10T08:00:00Z' }), // 0 days
      makeTask({ created_at: '2026-01-10T08:00:00Z', completed_at: '2026-01-12T08:00:00Z' }), // 2 days
    ];
    const obs = observeLifecycle(tasks)!;
    expect(obs.avgDaysToCompletion).toBe(1);
  });

  it('skips tasks without completed_at', () => {
    const tasks = [
      makeTask({ completed_at: '2026-01-10T08:00:00Z' }),
      makeTask({ completed_at: null }),
    ];
    const obs = observeLifecycle(tasks)!;
    expect(obs.sampleCount).toBe(1);
  });

  it('sets clusterLabel when called via observeClusterLifecycle', () => {
    const tasks = [makeTask()];
    const obs = observeClusterLifecycle(tasks, 'quote reroof');
    expect(obs?.clusterLabel).toBe('quote reroof');
  });
});
