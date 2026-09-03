import { describe, it, expect } from 'vitest';
import { observeTimeOfDay } from '../timeOfDay';
import type { CompletedTaskFacts } from '../../types';

function makeTask(createdAt: string = '2026-01-15T10:00:00Z'): CompletedTaskFacts {
  return {
    text: 'task',
    status: 'done',
    source: 'came_up',
    estimate_mins: 0,
    actual_mins: 10,
    logged_mins: 0,
    created_at: createdAt,
    completed_at: '2026-01-15T11:00:00Z',
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

describe('time-of-day - minimum evidence', () => {
  it('returns null for fewer than 3 tasks with timestamps', () => {
    expect(observeTimeOfDay([])).toBeNull();
    expect(observeTimeOfDay([makeTask('2026-01-15T10:00:00Z'), makeTask('2026-01-16T10:00:00Z')])).toBeNull();
  });

  it('returns null when tasks lack timestamps', () => {
    expect(observeTimeOfDay([makeTask(''), makeTask(''), makeTask('')])).toBeNull();
  });
});

describe('time-of-day - local timezone semantics', () => {
  it('detects a dominant period using local timezone', () => {
    // All created at 13:00Z. In UTC that's afternoon; in New York (UTC-5) it's morning.
    const tasks = [
      makeTask('2026-01-15T13:00:00Z'),
      makeTask('2026-01-16T13:00:00Z'),
      makeTask('2026-01-17T13:00:00Z'),
      makeTask('2026-01-18T13:00:00Z'),
    ];
    const utcObs = observeTimeOfDay(tasks, 'UTC');
    expect(utcObs!.affectedContext.timePeriod).toBe('afternoon');

    const nyObs = observeTimeOfDay(tasks, 'America/New_York');
    expect(nyObs!.affectedContext.timePeriod).toBe('morning');
  });

  it('emits a descriptive (non-causal) observation', () => {
    const tasks = [
      makeTask('2026-01-15T08:00:00Z'),
      makeTask('2026-01-16T08:30:00Z'),
      makeTask('2026-01-17T09:00:00Z'),
      makeTask('2026-01-18T08:15:00Z'),
    ];
    const obs = observeTimeOfDay(tasks, 'UTC');
    expect(obs!.type).toBe('time_of_day');
    expect(obs!.title.toLowerCase()).not.toContain('causes');
    expect(obs!.title.toLowerCase()).not.toContain('makes you');
    expect(obs!.title.toLowerCase()).not.toContain('because');
  });
});

describe('time-of-day - effect and baseline', () => {
  it('weights against a uniform baseline', () => {
    // All in morning → strong concentration
    const tasks = [
      makeTask('2026-01-15T07:00:00Z'),
      makeTask('2026-01-16T07:30:00Z'),
      makeTask('2026-01-17T08:00:00Z'),
      makeTask('2026-01-18T07:45:00Z'),
    ];
    const obs = observeTimeOfDay(tasks, 'UTC');
    expect(obs).not.toBeNull();
  });

  it('emits even spread without a dominant bias', () => {
    const tasks = [
      makeTask('2026-01-15T03:00:00Z'), // night
      makeTask('2026-01-15T09:00:00Z'), // morning
      makeTask('2026-01-15T14:00:00Z'), // afternoon
      makeTask('2026-01-15T19:00:00Z'), // evening
    ];
    const obs = observeTimeOfDay(tasks, 'UTC');
    expect(obs).toBeNull(); // spread evenly, no meaningful dominant pattern with n=4
  });
});
