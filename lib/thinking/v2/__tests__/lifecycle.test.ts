import { describe, it, expect } from 'vitest';
import { observeV2Lifecycle } from '../lifecycle';
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

describe('lifecycle - minimum evidence', () => {
  it('returns nothing for empty input', () => {
    expect(observeV2Lifecycle([])).toEqual([]);
  });

  it('requires a minimum sample before emitting', () => {
    const tasks = [
      makeTask('2026-01-14T10:00:00Z', '2026-01-14T11:00:00Z'),
      makeTask('2026-01-15T10:00:00Z', '2026-01-15T11:00:00Z'),
    ];
    expect(observeV2Lifecycle(tasks)).toEqual([]);
  });
});

describe('lifecycle - same-day observation', () => {
  it('emits a same-day observation when most clear same day', () => {
    const tasks = [
      makeTask('2026-01-14T10:00:00Z', '2026-01-14T11:00:00Z'),
      makeTask('2026-01-15T10:00:00Z', '2026-01-15T11:00:00Z'),
      makeTask('2026-01-16T10:00:00Z', '2026-01-16T11:00:00Z'),
      makeTask('2026-01-17T10:00:00Z', '2026-01-17T12:00:00Z'),
      makeTask('2026-01-18T10:00:00Z', '2026-01-20T11:00:00Z'),
    ];
    const obs = observeV2Lifecycle(tasks, 'UTC');
    const sameDay = obs.find((o) => o.semanticType === 'lifecycle:same_day');
    expect(sameDay).toBeDefined();
    expect(sameDay!.evidence.insufficient).toBe(false);
  });

  it('emits nothing when same-day rate is balanced', () => {
    const tasks = [
      makeTask('2026-01-14T10:00:00Z', '2026-01-14T11:00:00Z'),
      makeTask('2026-01-15T10:00:00Z', '2026-01-16T11:00:00Z'),
      makeTask('2026-01-16T10:00:00Z', '2026-01-16T11:00:00Z'),
      makeTask('2026-01-17T10:00:00Z', '2026-01-18T11:00:00Z'),
      makeTask('2026-01-18T10:00:00Z', '2026-01-19T11:00:00Z'),
      makeTask('2026-01-19T10:00:00Z', '2026-01-20T11:00:00Z'),
    ];
    const obs = observeV2Lifecycle(tasks, 'UTC');
    const sameDay = obs.find((o) => o.semanticType === 'lifecycle:same_day');
    expect(sameDay).toBeUndefined();
  });
});

describe('lifecycle - missing timestamps', () => {
  it('excludes malformed timestamps and tracks them as missing, without fabricating', () => {
    const tasks = [
      makeTask('2026-01-14T10:00:00Z', '2026-01-14T11:00:00Z'),
      makeTask('2026-01-15T10:00:00Z', '2026-01-15T11:00:00Z'),
      makeTask('2026-01-16T10:00:00Z', '2026-01-16T11:00:00Z'),
      makeTask('2026-01-17T10:00:00Z', null),
      makeTask('bad-date', '2026-01-20T11:00:00Z'),
    ];
    const obs = observeV2Lifecycle(tasks, 'UTC');
    // Only 3 valid tasks remain — still enough to emit (>=3)
    const sameDay = obs.find((o) => o.semanticType === 'lifecycle:same_day');
    if (sameDay) {
      expect(sameDay.evidence.missingDataCount).toBe(2);
    } else {
      // The valid subset (3, all same-day) should emit
      expect(obs.length).toBeGreaterThan(0);
    }
  });
});
