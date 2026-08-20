import { describe, it, expect } from 'vitest';
import { findSpatialContext } from '../context/spatial';
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

describe('findSpatialContext', () => {
  const oakwoodLat = 52.4128;
  const oakwoodLng = -1.7745;

  it('returns empty when task has no coordinates', () => {
    const task = makeTask({ text: 'No coords' });
    const other = makeTask({ text: 'Other', lat: oakwoodLat, lng: oakwoodLng });
    expect(findSpatialContext(task, [task, other])).toEqual([]);
  });

  it('returns empty when other task has no coordinates', () => {
    const task = makeTask({ text: 'Has coords', lat: oakwoodLat, lng: oakwoodLng });
    const other = makeTask({ text: 'No coords' });
    expect(findSpatialContext(task, [task, other])).toEqual([]);
  });

  it('returns empty when no other tasks are nearby', () => {
    const task = makeTask({ text: 'Oakwood', lat: oakwoodLat, lng: oakwoodLng });
    const other = makeTask({ text: 'Far away', lat: 53.0, lng: -1.0 });
    expect(findSpatialContext(task, [task, other])).toEqual([]);
  });

  it('excludes the task itself', () => {
    const task = makeTask({ text: 'Self', lat: oakwoodLat, lng: oakwoodLng });
    const results = findSpatialContext(task, [task]);
    expect(results).toEqual([]);
  });

  it('finds tasks within 50m threshold', () => {
    const task = makeTask({ text: 'Oakwood', lat: oakwoodLat, lng: oakwoodLng });
    // ~20m away
    const nearby = makeTask({ text: 'Nearby', lat: oakwoodLat + 0.00018, lng: oakwoodLng });
    const results = findSpatialContext(task, [task, nearby]);
    expect(results).toHaveLength(1);
    expect(results[0].task.text).toBe('Nearby');
    expect(results[0].distanceMeters).toBeLessThan(50);
  });

  it('excludes tasks beyond 50m threshold', () => {
    const task = makeTask({ text: 'Oakwood', lat: oakwoodLat, lng: oakwoodLng });
    // ~100m away
    const far = makeTask({ text: 'Far', lat: oakwoodLat + 0.0009, lng: oakwoodLng });
    const results = findSpatialContext(task, [task, far]);
    expect(results).toEqual([]);
  });

  it('respects custom threshold', () => {
    const task = makeTask({ text: 'Oakwood', lat: oakwoodLat, lng: oakwoodLng });
    // ~100m away
    const far = makeTask({ text: 'Far', lat: oakwoodLat + 0.0009, lng: oakwoodLng });
    const results = findSpatialContext(task, [task, far], 150);
    expect(results).toHaveLength(1);
    expect(results[0].task.text).toBe('Far');
  });

  it('returns tasks sorted by distance ascending', () => {
    const task = makeTask({ text: 'Origin', lat: oakwoodLat, lng: oakwoodLng });
    const near = makeTask({ text: 'Near', lat: oakwoodLat + 0.0001, lng: oakwoodLng });
    const medium = makeTask({ text: 'Medium', lat: oakwoodLat + 0.0003, lng: oakwoodLng });
    const far = makeTask({ text: 'Far', lat: oakwoodLat + 0.0004, lng: oakwoodLng });

    const results = findSpatialContext(task, [task, near, medium, far]);
    expect(results).toHaveLength(3);
    expect(results[0].task.text).toBe('Near');
    expect(results[1].task.text).toBe('Medium');
    expect(results[2].task.text).toBe('Far');
  });

  it('handles GPS drift within threshold', () => {
    const task = makeTask({ text: 'Oakwood', lat: oakwoodLat, lng: oakwoodLng });
    // ~30m away (drift)
    const drifted = makeTask({ text: 'Drifted', lat: oakwoodLat + 0.00027, lng: oakwoodLng });
    const results = findSpatialContext(task, [task, drifted]);
    expect(results).toHaveLength(1);
    expect(results[0].distanceMeters).toBeLessThan(50);
  });

  it('handles GPS drift beyond threshold', () => {
    const task = makeTask({ text: 'Oakwood', lat: oakwoodLat, lng: oakwoodLng });
    // ~60m away (drift beyond threshold)
    const drifted = makeTask({ text: 'Drifted far', lat: oakwoodLat + 0.00054, lng: oakwoodLng });
    const results = findSpatialContext(task, [task, drifted]);
    expect(results).toEqual([]);
  });

  it('handles multiple nearby tasks at different distances', () => {
    const task = makeTask({ text: 'Origin', lat: oakwoodLat, lng: oakwoodLng });
    const t1 = makeTask({ text: '10m', lat: oakwoodLat + 0.00009, lng: oakwoodLng });
    const t2 = makeTask({ text: '20m', lat: oakwoodLat + 0.00018, lng: oakwoodLng });
    const t3 = makeTask({ text: '30m', lat: oakwoodLat + 0.00027, lng: oakwoodLng });
    const t4 = makeTask({ text: '40m', lat: oakwoodLat + 0.00036, lng: oakwoodLng });

    const results = findSpatialContext(task, [task, t1, t2, t3, t4]);
    expect(results).toHaveLength(4);
    expect(results.map((r) => r.task.text)).toEqual(['10m', '20m', '30m', '40m']);
  });

  it('handles empty allTasks array', () => {
    const task = makeTask({ text: 'Solo', lat: oakwoodLat, lng: oakwoodLng });
    expect(findSpatialContext(task, [])).toEqual([]);
  });

  it('handles NaN coordinates gracefully', () => {
    const task = makeTask({ text: 'NaN', lat: NaN, lng: NaN });
    const other = makeTask({ text: 'Other', lat: oakwoodLat, lng: oakwoodLng });
    expect(findSpatialContext(task, [task, other])).toEqual([]);
  });

  it('handles Infinity coordinates gracefully', () => {
    const task = makeTask({ text: 'Inf', lat: Infinity, lng: -Infinity });
    const other = makeTask({ text: 'Other', lat: oakwoodLat, lng: oakwoodLng });
    expect(findSpatialContext(task, [task, other])).toEqual([]);
  });

  it('boundary: just inside 50m threshold', () => {
    const task = makeTask({ text: 'Origin', lat: oakwoodLat, lng: oakwoodLng });
    // ~49m away
    const boundary = makeTask({ text: 'Boundary', lat: oakwoodLat + 0.00044, lng: oakwoodLng });
    const results = findSpatialContext(task, [task, boundary]);
    // Should be included (<= threshold)
    expect(results).toHaveLength(1);
  });

  it('returns distance in metres', () => {
    const task = makeTask({ text: 'Origin', lat: oakwoodLat, lng: oakwoodLng });
    const other = makeTask({ text: 'Other', lat: oakwoodLat + 0.0001, lng: oakwoodLng });
    const results = findSpatialContext(task, [task, other]);
    expect(results[0].distanceMeters).toBeGreaterThan(0);
    expect(results[0].distanceMeters).toBeLessThan(50);
  });
});
