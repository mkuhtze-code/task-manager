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

describe('pipeline - integration proves actual detector invocation', () => {
  it('invokes estimate calibration and time-of-day detectors', () => {
    // 6 tasks, all in the same morning period, same-day completion, with
    // estimate-heavy planned sourcing → triggers estimate calibration + time
    // of day and task-context.
    const tasks: CompletedTaskFacts[] = [];
    for (let i = 0; i < 6; i++) {
      tasks.push(makeTask({
        text: `Task ${i}`,
        source: 'planned',
        estimate_mins: 30,
        actual_mins: 60, // persistent under-estimation
        created_at: `2026-01-${String(10 + i).padStart(2, '0')}T08:00:00Z`,
        completed_at: `2026-01-${String(10 + i).padStart(2, '0')}T09:00:00Z`,
      }));
    }
    const observations = runObservationPipeline(tasks, { timezone: 'UTC' });
    const sources = observations.map((o) => o.traceability.detectionSource);

    // Estimate calibration is triggered (6 valid estimate/actual pairs).
    expect(sources).toContain('estimateCalibration');
    // Time of day triggers when all tasks concentrate in one period.
    expect(sources).toContain('timeOfDay');
  });

  it('invokes carryover detector for repeated late tasks', () => {
    const mk = (n: number) => makeTask({
      text: 'Write report',
      source: 'planned',
      created_at: `2026-01-${String(n).padStart(2, '0')}T10:00:00Z`,
      surface_date: `2026-01-${String(n).padStart(2, '0')}`,
      completed_at: `2026-01-${String(n + 7).padStart(2, '0')}T10:00:00Z`,
    });
    const tasks = [mk(1), mk(8), mk(15)];
    const observations = runObservationPipeline(tasks, { timezone: 'UTC' });
    const sources = observations.map((o) => o.traceability.detectionSource);
    expect(sources).toContain('repeatedCarryover');
  });

  it('invokes the V1-family detectors (task-context, lifecycle, decomposition)', () => {
    // A corpus engineered to trigger task-context, lifecycle and decomposition.
    const tasks: CompletedTaskFacts[] = [];
    for (let i = 0; i < 5; i++) {
      tasks.push(makeTask({
        text: `Chore ${i}`,
        source: 'planned',
        subtaskCount: 2,
        subtaskDoneCount: 2,
        subtaskTotalMins: 20,
        created_at: `2026-01-${String(10 + i).padStart(2, '0')}T10:00:00Z`,
        completed_at: `2026-01-${String(10 + i).padStart(2, '0')}T11:00:00Z`,
      }));
    }
    const observations = runObservationPipeline(tasks, { timezone: 'UTC' });
    const sources = observations.map((o) => o.traceability.detectionSource);
    // All tasks planned → task-context planned_rate fires.
    expect(sources.some((s) => s.startsWith('taskContext'))).toBe(true);
    // All same-day → lifecycle fires.
    expect(sources).toContain('lifecycle.sameDay');
    // All decomposed → decomposition fires.
    expect(sources).toContain('decomposition.rate');
  });

  it('invokes cluster detector for a recurring cluster', () => {
    const tasks: CompletedTaskFacts[] = [];
    const taxes = ['File taxes', 'File taxes', 'File taxes', 'File taxes', 'File taxes'];
    taxes.forEach((text, i) => {
      tasks.push(makeTask({
        text,
        actual_mins: 40,
        created_at: `2026-01-${String(10 + i).padStart(2, '0')}T10:00:00Z`,
        completed_at: `2026-01-${String(10 + i).padStart(2, '0')}T11:00:00Z`,
      }));
    });
    // A second, faster cluster establishes a distinct corpus baseline so the
    // recurring "File taxes" cluster deviates materially from it.
    const errands = ['Quick errand', 'Quick errand', 'Quick errand'];
    errands.forEach((text, i) => {
      tasks.push(makeTask({
        text,
        actual_mins: 10,
        created_at: `2026-01-${String(20 + i).padStart(2, '0')}T10:00:00Z`,
        completed_at: `2026-01-${String(20 + i).padStart(2, '0')}T11:00:00Z`,
      }));
    });
    const observations = runObservationPipeline(tasks, { timezone: 'UTC' });
    const sources = observations.map((o) => o.traceability.detectionSource);
    expect(sources.some((s) => s.startsWith('cluster'))).toBe(true);
  });

  it('emits observations that are deduplicated and rank-ordered deterministically', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({
        text: `File taxes`,
        estimate_mins: 30,
        actual_mins: 60,
        subtaskCount: 2,
        subtaskDoneCount: 2,
        created_at: `2026-01-${String(10 + i).padStart(2, '0')}T08:00:00Z`,
        completed_at: `2026-01-${String(10 + i).padStart(2, '0')}T09:00:00Z`,
      }),
    );
    const r1 = runObservationPipeline(tasks, { timezone: 'UTC' });
    const r2 = runObservationPipeline([...tasks].reverse(), { timezone: 'UTC' });
    // Deterministic: same ids and same rank order regardless of input order
    expect(r1.map((o) => o.id)).toEqual(r2.map((o) => o.id));
    // Ranks are non-increasing
    for (let i = 1; i < r1.length; i++) {
      expect(r1[i].rank).toBeLessThanOrEqual(r1[i - 1].rank);
    }
  });
});
