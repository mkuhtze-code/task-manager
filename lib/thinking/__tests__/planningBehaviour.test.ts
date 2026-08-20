// lib/thinking/__tests__/planningBehaviour.test.ts
import { describe, it, expect } from 'vitest';
import { observePlanning, observeClusterPlanning } from '../observations/planningBehaviour';
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

describe('observePlanning', () => {
  it('returns null for empty array', () => {
    expect(observePlanning([])).toBeNull();
  });

  it('computes came_up rate', () => {
    const tasks = [
      makeTask({ source: 'came_up' }),
      makeTask({ source: 'came_up' }),
      makeTask({ source: 'planned' }),
    ];
    const obs = observePlanning(tasks)!;
    expect(obs.cameUpRate).toBeCloseTo(2 / 3);
  });

  it('computes estimated rate', () => {
    const tasks = [
      makeTask({ estimate_mins: 30 }),
      makeTask({ estimate_mins: 0 }),
    ];
    const obs = observePlanning(tasks)!;
    expect(obs.estimatedRate).toBe(0.5);
  });

  it('computes scheduled rate', () => {
    const tasks = [
      makeTask({ surface_date: '2026-01-15' }),
      makeTask({ surface_date: null }),
    ];
    const obs = observePlanning(tasks)!;
    expect(obs.scheduledRate).toBe(0.5);
  });

  it('computes located rate', () => {
    const tasks = [
      makeTask({ location_text: 'Henderson' }),
      makeTask({ location_text: null }),
    ];
    const obs = observePlanning(tasks)!;
    expect(obs.locatedRate).toBe(0.5);
  });

  it('computes job attached rate', () => {
    const tasks = [
      makeTask({ job_id: 'job-1' }),
      makeTask({ job_id: null }),
    ];
    const obs = observePlanning(tasks)!;
    expect(obs.jobAttachedRate).toBe(0.5);
  });

  it('computes info rate', () => {
    const tasks = [
      makeTask({ info: 'some notes' }),
      makeTask({ info: '' }),
      makeTask({ info: null }),
    ];
    const obs = observePlanning(tasks)!;
    expect(obs.infoRate).toBeCloseTo(1 / 3);
  });

  it('computes timer used rate', () => {
    const tasks = [
      makeTask({ logged_mins: 15 }),
      makeTask({ logged_mins: 0 }),
    ];
    const obs = observePlanning(tasks)!;
    expect(obs.timerUsedRate).toBe(0.5);
  });

  it('sets clusterLabel when called via observeClusterPlanning', () => {
    const tasks = [makeTask()];
    const obs = observeClusterPlanning(tasks, 'quote reroof');
    expect(obs?.clusterLabel).toBe('quote reroof');
  });
});
