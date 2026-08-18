// lib/thinking/__tests__/activityProfile.test.ts
import { describe, it, expect } from 'vitest';
import { buildActivityProfile, buildAllActivityProfiles } from '../compose/activityProfile';
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

describe('buildActivityProfile', () => {
  it('returns null for empty array', () => {
    expect(buildActivityProfile('cluster', [], NOW)).toBeNull();
  });

  it('builds a complete profile from task data', () => {
    const tasks = [
      makeTask({
        actual_mins: 30,
        source: 'came_up',
        location_text: 'Henderson',
        job_id: 'job-1',
        subtaskCount: 3,
        subtaskDoneCount: 2,
        created_at: '2026-01-10T08:00:00Z',
        completed_at: '2026-01-10T09:00:00Z',
      }),
      makeTask({
        actual_mins: 45,
        source: 'planned',
        location_text: null,
        job_id: null,
        subtaskCount: 0,
        subtaskDoneCount: 0,
        created_at: '2026-01-10T08:00:00Z',
        completed_at: '2026-01-11T09:00:00Z',
      }),
    ];
    const profile = buildActivityProfile('quote reroof', tasks, NOW)!;
    expect(profile.clusterLabel).toBe('quote reroof');
    expect(profile.count).toBe(2);
    expect(profile.avgMins).toBe(37.5);
    expect(profile.sameDayRate).toBe(0.5);
    expect(profile.carryoverRate).toBe(0.5);
    expect(profile.decomposeRate).toBe(0.5);
    expect(profile.avgSubtaskCount).toBe(1.5);
    expect(profile.cameUpRate).toBe(0.5);
    expect(profile.locatedRate).toBe(0.5);
    expect(profile.jobRate).toBe(0.5);
    expect(profile.confidence).toBe('low'); // 2 samples
  });

  it('detects improving trend', () => {
    const tasks = [
      makeTask({ actual_mins: 60, created_at: '2026-01-01T08:00:00Z', completed_at: '2026-01-01T09:00:00Z' }),
      makeTask({ actual_mins: 55, created_at: '2026-01-02T08:00:00Z', completed_at: '2026-01-02T09:00:00Z' }),
      makeTask({ actual_mins: 30, created_at: '2026-01-03T08:00:00Z', completed_at: '2026-01-03T09:00:00Z' }),
      makeTask({ actual_mins: 25, created_at: '2026-01-04T08:00:00Z', completed_at: '2026-01-04T09:00:00Z' }),
      makeTask({ actual_mins: 20, created_at: '2026-01-05T08:00:00Z', completed_at: '2026-01-05T09:00:00Z' }),
      makeTask({ actual_mins: 15, created_at: '2026-01-06T08:00:00Z', completed_at: '2026-01-06T09:00:00Z' }),
    ];
    const profile = buildActivityProfile('task', tasks, NOW)!;
    expect(profile.trend).toBe('improving');
  });
});

describe('buildAllActivityProfiles', () => {
  it('groups tasks by label function and builds profiles', () => {
    const tasks = [
      makeTask({ text: 'quote reroof', actual_mins: 30, completed_at: '2026-01-10T09:00:00Z' }),
      makeTask({ text: 'quote reroof', actual_mins: 45, completed_at: '2026-01-10T10:00:00Z' }),
      makeTask({ text: 'pick up materials', actual_mins: 15, completed_at: '2026-01-10T11:00:00Z' }),
    ];
    const profiles = buildAllActivityProfiles(tasks, (t) => t.text.split(' ')[0], NOW);
    expect(profiles.length).toBe(2);
    // Sorted by count descending
    expect(profiles[0].count).toBe(2);
    expect(profiles[1].count).toBe(1);
  });

  it('returns empty array for no tasks', () => {
    expect(buildAllActivityProfiles([], () => 'label', NOW)).toEqual([]);
  });
});
