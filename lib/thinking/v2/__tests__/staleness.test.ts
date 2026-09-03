import { describe, it, expect } from 'vitest';
import { observeV2Staleness } from '../staleness';
import type { CompletedTaskFacts } from '../../types';

function makeTask(createdAt: string, completedAt: string | null): CompletedTaskFacts {
  return {
    text: 'task',
    status: 'done',
    source: 'planned',
    estimate_mins: 30,
    actual_mins: 30,
    logged_mins: 0,
    created_at: createdAt,
    completed_at: completedAt,
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
  };
}

describe('staleness - minimum evidence', () => {
  it('returns nothing for empty or tiny input', () => {
    expect(observeV2Staleness([])).toEqual([]);
    expect(observeV2Staleness([
      makeTask('2026-01-01T10:00:00Z', '2026-01-10T10:00:00Z'),
      makeTask('2026-01-02T10:00:00Z', '2026-01-03T10:00:00Z'),
    ])).toEqual([]);
  });
});

describe('staleness - completed after a stall', () => {
  it('emits when tasks commonly complete well after creation', () => {
    const tasks = [
      makeTask('2026-01-01T10:00:00Z', '2026-01-12T10:00:00Z'),
      makeTask('2026-01-02T10:00:00Z', '2026-01-15T10:00:00Z'),
      makeTask('2026-01-03T10:00:00Z', '2026-01-20T10:00:00Z'),
      makeTask('2026-01-04T10:00:00Z', '2026-01-10T10:00:00Z'),
      makeTask('2026-01-05T10:00:00Z', '2026-01-06T10:00:00Z'),
    ];
    const obs = observeV2Staleness(tasks, 'UTC');
    const stale = obs.find((o) => o.semanticType === 'staleness:completed_after_stall');
    expect(stale).toBeDefined();
    expect(stale!.evidence.insufficient).toBe(false);
  });

  it('emits nothing when tasks clear quickly', () => {
    const tasks = [
      makeTask('2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z'),
      makeTask('2026-01-02T10:00:00Z', '2026-01-02T11:00:00Z'),
      makeTask('2026-01-03T10:00:00Z', '2026-01-03T11:00:00Z'),
      makeTask('2026-01-04T10:00:00Z', '2026-01-04T11:00:00Z'),
      makeTask('2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z'),
    ];
    const obs = observeV2Staleness(tasks, 'UTC');
    const stale = obs.find((o) => o.semanticType === 'staleness:completed_after_stall');
    expect(stale).toBeUndefined();
  });
});
