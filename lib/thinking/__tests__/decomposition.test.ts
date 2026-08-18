// lib/thinking/__tests__/decomposition.test.ts
import { describe, it, expect } from 'vitest';
import { observeDecomposition, observeClusterDecomposition } from '../observations/decomposition';
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

describe('observeDecomposition', () => {
  it('returns null for empty array', () => {
    expect(observeDecomposition([])).toBeNull();
  });

  it('computes decompose rate correctly', () => {
    const tasks = [
      makeTask({ subtaskCount: 3, subtaskDoneCount: 2, subtaskTotalMins: 30 }),
      makeTask({ subtaskCount: 0, subtaskDoneCount: 0, subtaskTotalMins: 0 }),
      makeTask({ subtaskCount: 5, subtaskDoneCount: 5, subtaskTotalMins: 60 }),
    ];
    const obs = observeDecomposition(tasks)!;
    expect(obs.decomposeRate).toBeCloseTo(2 / 3);
  });

  it('computes average subtask count', () => {
    const tasks = [
      makeTask({ subtaskCount: 3 }),
      makeTask({ subtaskCount: 0 }),
      makeTask({ subtaskCount: 6 }),
    ];
    const obs = observeDecomposition(tasks)!;
    expect(obs.avgSubtaskCount).toBe(3);
  });

  it('computes subtask completion rate', () => {
    const tasks = [
      makeTask({ subtaskCount: 4, subtaskDoneCount: 3 }),
      makeTask({ subtaskCount: 2, subtaskDoneCount: 2 }),
    ];
    const obs = observeDecomposition(tasks)!;
    // 5 done out of 6 total
    expect(obs.subtaskCompletionRate).toBeCloseTo(5 / 6);
  });

  it('returns 0 subtask completion rate when no subtasks', () => {
    const tasks = [makeTask({ subtaskCount: 0 })];
    const obs = observeDecomposition(tasks)!;
    expect(obs.subtaskCompletionRate).toBe(0);
  });

  it('sets clusterLabel when called via observeClusterDecomposition', () => {
    const tasks = [makeTask()];
    const obs = observeClusterDecomposition(tasks, 'quote reroof');
    expect(obs?.clusterLabel).toBe('quote reroof');
  });
});
