import { describe, it, expect } from 'vitest';
import { observeV2TaskContext } from '../taskContext';
import type { CompletedTaskFacts } from '../../types';

function makeTask(over: Partial<CompletedTaskFacts> = {}): CompletedTaskFacts {
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
    subtaskCount: 0,
    subtaskDoneCount: 0,
    subtaskTotalMins: 0,
    ...over,
  };
}

describe('task-context - minimum evidence', () => {
  it('returns nothing for empty or tiny input', () => {
    expect(observeV2TaskContext([])).toEqual([]);
    // Fewer than 3 tasks → no proportion claim may be emitted.
    expect(observeV2TaskContext([makeTask({}), makeTask({})])).toEqual([]);
  });
});

describe('task-context - planning behaviour', () => {
  it('emits a planned-in-advance observation when clearly planned', () => {
    const tasks = [
      makeTask({ source: 'planned' }),
      makeTask({ source: 'planned' }),
      makeTask({ source: 'planned' }),
      makeTask({ source: 'planned' }),
      makeTask({ source: 'came_up' }),
    ];
    const obs = observeV2TaskContext(tasks);
    const planned = obs.find((o) => o.semanticType === 'task_context:planned_rate');
    expect(planned).toBeDefined();
    expect(planned!.evidence.insufficient).toBe(false);
    expect(planned!.evidence.effectMagnitude).toBeGreaterThan(0);
  });

  it('does not emit a planned claim when the split is near 50/50', () => {
    const tasks = [
      makeTask({ source: 'planned' }),
      makeTask({ source: 'came_up' }),
      makeTask({ source: 'planned' }),
      makeTask({ source: 'came_up' }),
    ];
    const obs = observeV2TaskContext(tasks);
    const planned = obs.find((o) => o.semanticType === 'task_context:planned_rate');
    // rate 0.5 == baseline, effect ~0 → not emitted
    expect(planned).toBeUndefined();
  });

  it('uses descriptive, non-causal wording', () => {
    const tasks = [
      makeTask({}),
      makeTask({}),
      makeTask({}),
      makeTask({}),
    ];
    const obs = observeV2TaskContext(tasks);
    for (const o of obs) {
      const s = (o.title + ' ' + o.description).toLowerCase();
      expect(s).not.toContain('cause');
      expect(s).not.toContain('makes you');
    }
  });
});

describe('task-context - other fields', () => {
  it('emits located/estimated/job observations when dominant', () => {
    const tasks = [
      makeTask({ location_text: 'Store', job_id: 'j1' }),
      makeTask({ location_text: 'Store', job_id: 'j1' }),
      makeTask({ location_text: 'Store', job_id: 'j1' }),
      makeTask({ location_text: 'Store', job_id: 'j1' }),
    ];
    const obs = observeV2TaskContext(tasks);
    const types = obs.map((o) => o.semanticType);
    expect(types).toContain('task_context:located_rate');
    expect(types).toContain('task_context:job_rate');
    expect(types).toContain('task_context:estimated_rate');
  });
});
