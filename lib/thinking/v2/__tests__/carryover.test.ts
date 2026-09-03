import { describe, it, expect } from 'vitest';
import {
  detectCarryover,
  detectAllCarryovers,
  observeRepeatedCarryover,
} from '../carryover';
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
    completed_at: null,
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

describe('carryover - true carryover', () => {
  it('detects a task completed after its creation date (planned task)', () => {
    const task = makeTask({
      source: 'planned',
      created_at: '2026-01-14T10:00:00Z',
      completed_at: '2026-01-17T10:00:00Z',
    });
    const result = detectCarryover(task, [task], 'UTC');
    expect(result.kind).toBe('single');
    expect(result.daysOverdue).toBe(3);
    expect(result.intendedDate).toBe('2026-01-14');
  });

  it('detects carryover from a task with a future surface_date completed later', () => {
    const task = makeTask({
      source: 'planned',
      surface_date: '2026-01-15',
      created_at: '2026-01-10T10:00:00Z',
      completed_at: '2026-01-17T10:00:00Z',
    });
    const result = detectCarryover(task, [task], 'UTC');
    expect(result.kind).toBe('single');
    expect(result.intendedDate).toBe('2026-01-15');
    expect(result.daysOverdue).toBe(2);
  });
});

describe('carryover - repeated carryover', () => {
  it('detects repeated carryover when prior intended dates exist', () => {
    const task = makeTask({
      text: 'Write report',
      surface_date: '2026-01-20',
      created_at: '2026-01-18T10:00:00Z',
      completed_at: '2026-01-22T10:00:00Z',
    });
    const prior = makeTask({
      text: 'Write report',
      surface_date: '2026-01-13',
      created_at: '2026-01-12T10:00:00Z',
      completed_at: '2026-01-16T10:00:00Z',
    });
    const prior2 = makeTask({
      text: 'Write report',
      surface_date: '2026-01-06',
      created_at: '2026-01-05T10:00:00Z',
      completed_at: '2026-01-09T10:00:00Z',
    });
    const result = detectCarryover(task, [task, prior, prior2], 'UTC');
    expect(result.kind).toBe('repeated');
    expect(result.previousIntendedDates).toEqual(['2026-01-06', '2026-01-13']);
  });
});

describe('carryover - NOT carryover', () => {
  it('does not flag a task intentionally scheduled for a later date', () => {
    const task = makeTask({
      source: 'planned',
      surface_date: '2026-02-01',
      created_at: '2026-01-10T10:00:00Z',
      completed_at: '2026-02-01T10:00:00Z',
    });
    const result = detectCarryover(task, [task], 'UTC');
    // Completed on its intended date → not carryover
    expect(result.kind).toBe('none');
  });

  it('does not infer carryover from mere differing UTC dates without a commitment', () => {
    const task = makeTask({
      source: 'came_up',
      created_at: '2026-01-14T10:00:00Z',
      completed_at: '2026-01-16T10:00:00Z',
    });
    const result = detectCarryover(task, [task], 'UTC');
    expect(result.kind).toBe('none');
  });

  it('returns none when completed before or on intended date', () => {
    const task = makeTask({
      source: 'planned',
      created_at: '2026-01-14T10:00:00Z',
      completed_at: '2026-01-14T11:00:00Z',
    });
    const result = detectCarryover(task, [task], 'UTC');
    expect(result.kind).toBe('none');
  });
});

describe('carryover - missing/malformed data', () => {
  it('returns none for a task without completed_at', () => {
    const task = makeTask({ completed_at: null });
    const result = detectCarryover(task, [task], 'UTC');
    expect(result.kind).toBe('none');
  });

  it('returns none for a task without created_at', () => {
    const task = makeTask({ created_at: '', completed_at: '2026-01-17T10:00:00Z' });
    const result = detectCarryover(task, [task], 'UTC');
    expect(result.kind).toBe('none');
  });
});

describe('carryover - local date semantics', () => {
  it('uses local calendar dates for carryover comparison', () => {
    // Task created 2026-01-14T23:30:00Z, completed 2026-01-16T00:30:00Z
    // In New York both are on Jan 14 (23:30 EST) → Jan 15/16 local, actually let's reason:
    // 23:30Z on Jan 14 = 18:30 EST Jan 14 (NY local date Jan 14)
    // 00:30Z on Jan 16 = 19:30 EST Jan 15 (NY local date Jan 15)
    // So local dates: created Jan 14, completed Jan 15 → 1 day overdue
    const task = makeTask({
      source: 'planned',
      created_at: '2026-01-14T23:30:00Z',
      completed_at: '2026-01-16T00:30:00Z',
    });
    const result = detectCarryover(task, [task], 'America/New_York');
    expect(result.kind).toBe('single');
    expect(result.daysOverdue).toBe(1);
  });
});

describe('carryover - aggregation', () => {
  it('returns empty when no carryovers exist', () => {
    const tasks = [
      makeTask({ source: 'came_up', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ source: 'came_up', completed_at: '2026-01-16T10:00:00Z' }),
    ];
    expect(detectAllCarryovers(tasks, 'UTC')).toEqual([]);
  });

  it('summarises repeated carryover into an observation', () => {
    const t1 = makeTask({
      text: 'Read chapter',
      source: 'planned',
      created_at: '2026-01-05T10:00:00Z',
      completed_at: '2026-01-10T10:00:00Z',
    });
    const t2 = makeTask({
      text: 'Read chapter',
      source: 'planned',
      created_at: '2026-01-12T10:00:00Z',
      completed_at: '2026-01-18T10:00:00Z',
    });
    const t3 = makeTask({
      text: 'Read chapter',
      source: 'planned',
      created_at: '2026-01-20T10:00:00Z',
      completed_at: '2026-01-28T10:00:00Z',
    });
    const obs = observeRepeatedCarryover([t1, t2, t3], 'UTC');
    expect(obs).not.toBeNull();
    expect(obs!.type).toBe('repeated_carryover');
    expect(obs!.evidence.sampleSize).toBeGreaterThanOrEqual(2);
  });

  it('returns null with insufficient history', () => {
    expect(observeRepeatedCarryover([], 'UTC')).toBeNull();
    expect(observeRepeatedCarryover([makeTask({ completed_at: null })], 'UTC')).toBeNull();
  });
});
