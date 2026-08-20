import { describe, it, expect } from 'vitest';
import { getCoOccurrenceContext } from '../context/coOccurrence';
import type { CompletedTaskFacts } from '../types';

function makeTask(overrides: Partial<CompletedTaskFacts> = {}): CompletedTaskFacts {
  return {
    text: 'Test task',
    status: 'done',
    source: 'planned',
    estimate_mins: 60,
    actual_mins: 60,
    logged_mins: 60,
    created_at: '2025-01-15T09:00:00Z',
    completed_at: '2025-01-15T10:00:00Z',
    started_at: '2025-01-15T09:00:00Z',
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

describe('getCoOccurrenceContext', () => {
  const oakwoodLat = 52.4128;
  const oakwoodLng = -1.7745;

  it('returns empty context for isolated task', () => {
    const task = makeTask({ text: 'Solo' });
    const result = getCoOccurrenceContext(task, [task]);
    expect(result.task).toBe(task);
    expect(result.spatial).toEqual([]);
    expect(result.sameDay).toEqual([]);
    expect(result.preceding).toEqual([]);
    expect(result.following).toEqual([]);
  });

  it('composes spatial relationships', () => {
    const task = makeTask({ text: 'Oakwood', lat: oakwoodLat, lng: oakwoodLng });
    const nearby = makeTask({ text: 'Nearby', lat: oakwoodLat + 0.0001, lng: oakwoodLng });
    const result = getCoOccurrenceContext(task, [task, nearby]);
    expect(result.spatial).toHaveLength(1);
    expect(result.spatial[0].task.text).toBe('Nearby');
  });

  it('composes same-day relationships', () => {
    const task = makeTask({ text: 'Morning', created_at: '2025-01-15T09:00:00Z' });
    const sameDay = makeTask({ text: 'Afternoon', created_at: '2025-01-15T14:00:00Z' });
    const result = getCoOccurrenceContext(task, [task, sameDay]);
    expect(result.sameDay).toHaveLength(1);
    expect(result.sameDay[0].task.text).toBe('Afternoon');
  });

  it('composes sequence relationships', () => {
    const task = makeTask({ text: 'Middle', created_at: '2025-01-15T12:00:00Z' });
    const before = makeTask({ text: 'Before', created_at: '2025-01-15T09:00:00Z' });
    const after = makeTask({ text: 'After', created_at: '2025-01-15T15:00:00Z' });
    const result = getCoOccurrenceContext(task, [task, before, after]);
    expect(result.preceding).toHaveLength(1);
    expect(result.preceding[0].task.text).toBe('Before');
    expect(result.following).toHaveLength(1);
    expect(result.following[0].task.text).toBe('After');
  });

  it('composes all dimensions together', () => {
    const task = makeTask({
      text: 'Anchor',
      lat: oakwoodLat,
      lng: oakwoodLng,
      created_at: '2025-01-15T12:00:00Z',
    });
    const nearby = makeTask({
      text: 'Nearby',
      lat: oakwoodLat + 0.0001,
      lng: oakwoodLng,
      created_at: '2025-01-15T12:30:00Z',
    });
    const before = makeTask({
      text: 'Before',
      lat: oakwoodLat + 0.0002,
      lng: oakwoodLng,
      created_at: '2025-01-15T11:00:00Z',
    });
    const after = makeTask({
      text: 'After',
      created_at: '2025-01-15T14:00:00Z',
    });
    const differentDay = makeTask({
      text: 'Different day',
      created_at: '2025-01-16T09:00:00Z',
    });

    const result = getCoOccurrenceContext(task, [task, nearby, before, after, differentDay]);

    // Should find nearby tasks
    expect(result.spatial.length).toBeGreaterThanOrEqual(1);
    // Should find same-day tasks
    expect(result.sameDay.length).toBeGreaterThanOrEqual(2);
    // Should find preceding
    expect(result.preceding).toHaveLength(1);
    expect(result.preceding[0].task.text).toBe('Before');
    // Should find following (Nearby at 12:30 is immediate, After at 14:00 is not)
    expect(result.following).toHaveLength(1);
    expect(result.following[0].task.text).toBe('Nearby');
    // Different day task should not appear in sameDay
    expect(result.sameDay.find((r) => r.task.text === 'Different day')).toBeUndefined();
  });

  it('dimensions are independently computed', () => {
    // Task has spatial matches but no same-day matches
    const task = makeTask({
      text: 'Has coords',
      lat: oakwoodLat,
      lng: oakwoodLng,
      created_at: '2025-01-15T09:00:00Z',
    });
    const nearbyDifferentDay = makeTask({
      text: 'Nearby different day',
      lat: oakwoodLat + 0.0001,
      lng: oakwoodLng,
      created_at: '2025-01-16T09:00:00Z',
    });

    const result = getCoOccurrenceContext(task, [task, nearbyDifferentDay]);
    expect(result.spatial).toHaveLength(1);
    expect(result.sameDay).toEqual([]);
  });

  it('handles empty allTasks array', () => {
    const task = makeTask({ text: 'Solo' });
    const result = getCoOccurrenceContext(task, []);
    expect(result.task).toBe(task);
    expect(result.spatial).toEqual([]);
    expect(result.sameDay).toEqual([]);
    expect(result.preceding).toEqual([]);
    expect(result.following).toEqual([]);
  });

  it('excludes the task itself from all dimensions', () => {
    const task = makeTask({
      text: 'Self',
      lat: oakwoodLat,
      lng: oakwoodLng,
      created_at: '2025-01-15T09:00:00Z',
    });
    const result = getCoOccurrenceContext(task, [task]);
    expect(result.spatial).toEqual([]);
    expect(result.sameDay).toEqual([]);
    expect(result.preceding).toEqual([]);
    expect(result.following).toEqual([]);
  });

  it('returns the task reference in the context', () => {
    const task = makeTask({ text: 'Anchor' });
    const result = getCoOccurrenceContext(task, [task]);
    expect(result.task).toBe(task);
  });

  it('handles personal task near job site without interpretation', () => {
    // Personal task at job coordinates
    const task = makeTask({
      text: 'School run',
      lat: oakwoodLat,
      lng: oakwoodLng,
      created_at: '2025-01-15T08:00:00Z',
    });
    const jobTask = makeTask({
      text: 'Site visit',
      lat: oakwoodLat + 0.0001,
      lng: oakwoodLng,
      created_at: '2025-01-15T09:00:00Z',
    });

    const result = getCoOccurrenceContext(task, [task, jobTask]);
    // Should report spatial relationship factually
    expect(result.spatial).toHaveLength(1);
    expect(result.spatial[0].task.text).toBe('Site visit');
    // Should report same-day relationship factually
    expect(result.sameDay).toHaveLength(1);
    // Should not contain any interpretation
    expect(result).not.toHaveProperty('confidence');
    expect(result).not.toHaveProperty('relevance');
    expect(result).not.toHaveProperty('inferredJob');
  });
});
