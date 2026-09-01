// lib/thinking/__tests__/staleness.test.ts
import { describe, it, expect } from 'vitest';
import { observeStaleness, observeClusterStaleness } from '../observations/staleness';
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

const NOW = new Date('2026-01-15T12:00:00Z');

describe('observeStaleness', () => {
  it('returns null for empty array', () => {
    expect(observeStaleness([], NOW)).toBeNull();
  });

  it('detects stale uncompleted tasks', () => {
    const tasks = [
      // Created 10 days ago, not completed yet (completed_at: null) → stale
      makeTask({
        completed_at: null,
        actual_mins: null,
        created_at: '2026-01-05T08:00:00Z',
      }),
    ];
    const obs = observeStaleness(tasks, NOW)!;
    expect(obs.staleRate).toBe(1);
  });

  it('does not consider recent uncompleted tasks stale', () => {
    const tasks = [
      makeTask({
        completed_at: null,
        actual_mins: null,
        created_at: '2026-01-14T08:00:00Z', // 1 day ago
      }),
    ];
    const obs = observeStaleness(tasks, NOW)!;
    expect(obs.staleRate).toBe(0);
  });

  it('detects completion after stall', () => {
    const tasks = [
      // Created 10 days ago, completed recently → was old when completed
      makeTask({
        created_at: '2026-01-05T08:00:00Z',
        completed_at: '2026-01-15T08:00:00Z',
      }),
      // Created yesterday, completed today → was not old
      makeTask({
        created_at: '2026-01-14T08:00:00Z',
        completed_at: '2026-01-15T08:00:00Z',
      }),
    ];
    const obs = observeStaleness(tasks, NOW)!;
    expect(obs.completionAfterStallRate).toBe(0.5);
  });

  it('computes average age', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-10T12:00:00Z', completed_at: '2026-01-10T12:00:00Z' }), // 5 days old
      makeTask({ created_at: '2026-01-14T12:00:00Z', completed_at: '2026-01-14T12:00:00Z' }), // 1 day old
    ];
    const obs = observeStaleness(tasks, NOW)!;
    expect(obs.avgAgeDays).toBe(3);
  });

  it('sets clusterLabel when called via observeClusterStaleness', () => {
    const tasks = [makeTask()];
    const obs = observeClusterStaleness(tasks, 'quote reroof', NOW);
    expect(obs?.clusterLabel).toBe('quote reroof');
  });
});
