import { describe, it, expect } from 'vitest';
import { observeV2Decomposition } from '../decomposition';
import type { CompletedTaskFacts } from '../../types';

function makeTask(subtaskCount: number): CompletedTaskFacts {
  return {
    text: 'task',
    status: 'done',
    source: 'planned',
    estimate_mins: 30,
    actual_mins: 30,
    logged_mins: 0,
    created_at: '2026-01-14T10:00:00Z',
    completed_at: '2026-01-14T11:00:00Z',
    started_at: null,
    surface_date: null,
    location_text: null,
    lat: null,
    lng: null,
    job_id: null,
    info: null,
    subtaskCount,
    subtaskDoneCount: subtaskCount,
    subtaskTotalMins: 0,
  };
}

describe('decomposition - minimum evidence', () => {
  it('returns nothing for empty input', () => {
    expect(observeV2Decomposition([])).toEqual([]);
  });

  it('requires a minimum sample', () => {
    expect(observeV2Decomposition([makeTask(1), makeTask(0)])).toEqual([]);
  });
});

describe('decomposition - observation emission', () => {
  it('emits when tasks are usually decomposed', () => {
    const tasks = [
      makeTask(3),
      makeTask(2),
      makeTask(4),
      makeTask(1),
      makeTask(0),
    ];
    const obs = observeV2Decomposition(tasks);
    const decomp = obs.find((o) => o.semanticType === 'decomposition:rate');
    expect(decomp).toBeDefined();
    expect(decomp!.evidence.insufficient).toBe(false);
    expect(decomp!.evidence.sampleSize).toBe(4); // 4 tasks have subtasks
  });

  it('emits nothing when decomposition is balanced', () => {
    const tasks = [
      makeTask(0),
      makeTask(2),
      makeTask(0),
      makeTask(1),
    ];
    const obs = observeV2Decomposition(tasks);
    const decomp = obs.find((o) => o.semanticType === 'decomposition:rate');
    expect(decomp).toBeUndefined();
  });
});
