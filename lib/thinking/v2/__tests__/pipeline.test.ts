import { describe, it, expect } from 'vitest';
import { runObservationPipeline } from '../pipeline';
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

describe('pipeline - returns ranked structured observations', () => {
  it('returns an empty array for no data', () => {
    expect(runObservationPipeline([])).toEqual([]);
  });

  it('emits observations when sufficient evidence exists', () => {
    const createdAt = '2026-01-14T08:00:00Z';
    const tasks = Array.from({ length: 8 }, (_, i) =>
      makeTask({
        estimate_mins: 30,
        actual_mins: 30,
        created_at: `2026-01-${String(14 + i).padStart(2, '0')}T08:00:00Z`,
        completed_at: `2026-01-${String(14 + i).padStart(2, '0')}T09:00:00Z`,
      }),
    );
    const observations = runObservationPipeline(tasks, { timezone: 'UTC' });
    expect(observations.length).toBeGreaterThan(0);
    // Observations carry ids and rank fields
    for (const obs of observations) {
      expect(obs.id).toBeTruthy();
      expect(typeof obs.rank).toBe('number');
      expect(obs.evidence).toBeDefined();
    }
  });

  it('does not fabricate observations for sparse data', () => {
    const tasks = [makeTask({}), makeTask({})];
    const observations = runObservationPipeline(tasks, { timezone: 'UTC' });
    expect(observations).toEqual([]);
  });
});
