import { describe, it, expect } from 'vitest';
import { findSameDayContext } from '../context/temporal';
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

describe('findSameDayContext', () => {
  it('returns empty when task has no created_at', () => {
    const task = makeTask({ text: 'No timestamp', created_at: '' });
    const other = makeTask({ text: 'Other' });
    expect(findSameDayContext(task, [task, other])).toEqual([]);
  });

  it('returns empty when other task has no created_at', () => {
    const task = makeTask({ text: 'Has timestamp' });
    const other = makeTask({ text: 'No timestamp', created_at: '' });
    expect(findSameDayContext(task, [task, other])).toEqual([]);
  });

  it('returns empty when no other tasks share the same day', () => {
    const task = makeTask({ text: 'Jan 15', created_at: '2025-01-15T09:00:00Z' });
    const other = makeTask({ text: 'Jan 16', created_at: '2025-01-16T09:00:00Z' });
    expect(findSameDayContext(task, [task, other])).toEqual([]);
  });

  it('excludes the task itself', () => {
    const task = makeTask({ text: 'Self', created_at: '2025-01-15T09:00:00Z' });
    const results = findSameDayContext(task, [task]);
    expect(results).toEqual([]);
  });

  it('finds tasks on the same UTC calendar day', () => {
    const task = makeTask({ text: 'Morning', created_at: '2025-01-15T09:00:00Z' });
    const sameDay = makeTask({ text: 'Afternoon', created_at: '2025-01-15T14:00:00Z' });
    const results = findSameDayContext(task, [task, sameDay]);
    expect(results).toHaveLength(1);
    expect(results[0].task.text).toBe('Afternoon');
  });

  it('returns tasks ordered by created_at ascending', () => {
    const task = makeTask({ text: 'Middle', created_at: '2025-01-15T12:00:00Z' });
    const early = makeTask({ text: 'Early', created_at: '2025-01-15T08:00:00Z' });
    const late = makeTask({ text: 'Late', created_at: '2025-01-15T16:00:00Z' });
    const results = findSameDayContext(task, [task, early, late]);
    expect(results).toHaveLength(2);
    expect(results[0].task.text).toBe('Early');
    expect(results[1].task.text).toBe('Late');
  });

  it('calculates gapMinutes for forward chronological tasks', () => {
    const task = makeTask({ text: 'Start', created_at: '2025-01-15T09:00:00Z' });
    const later = makeTask({ text: 'Later', created_at: '2025-01-15T10:30:00Z' });
    const results = findSameDayContext(task, [task, later]);
    expect(results[0].gapMinutes).toBe(90);
  });

  it('returns null gapMinutes for tasks with missing timestamps', () => {
    const task = makeTask({ text: 'Has timestamp', created_at: '2025-01-15T09:00:00Z' });
    const noTs = makeTask({ text: 'No timestamp', created_at: '' });
    // This should not be included since it has no timestamp
    const results = findSameDayContext(task, [task, noTs]);
    expect(results).toEqual([]);
  });

  it('handles tasks on adjacent days', () => {
    const task = makeTask({ text: 'Jan 15', created_at: '2025-01-15T23:00:00Z' });
    const nextDay = makeTask({ text: 'Jan 16', created_at: '2025-01-16T01:00:00Z' });
    const results = findSameDayContext(task, [task, nextDay]);
    expect(results).toEqual([]);
  });

  it('handles multiple tasks on same day', () => {
    const task = makeTask({ text: 'Anchor', created_at: '2025-01-15T12:00:00Z' });
    const t1 = makeTask({ text: 'Task 1', created_at: '2025-01-15T08:00:00Z' });
    const t2 = makeTask({ text: 'Task 2', created_at: '2025-01-15T10:00:00Z' });
    const t3 = makeTask({ text: 'Task 3', created_at: '2025-01-15T14:00:00Z' });
    const results = findSameDayContext(task, [task, t1, t2, t3]);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.task.text)).toEqual(['Task 1', 'Task 2', 'Task 3']);
  });

  it('handles identical timestamps', () => {
    const task = makeTask({ text: 'A', created_at: '2025-01-15T09:00:00Z' });
    const sameTime = makeTask({ text: 'B', created_at: '2025-01-15T09:00:00Z' });
    const results = findSameDayContext(task, [task, sameTime]);
    expect(results).toHaveLength(1);
    expect(results[0].task.text).toBe('B');
    expect(results[0].gapMinutes).toBe(0);
  });

  it('handles empty allTasks array', () => {
    const task = makeTask({ text: 'Solo' });
    expect(findSameDayContext(task, [])).toEqual([]);
  });

  it('handles invalid timestamp gracefully', () => {
    const task = makeTask({ text: 'Invalid', created_at: 'not-a-date' });
    const other = makeTask({ text: 'Other' });
    expect(findSameDayContext(task, [task, other])).toEqual([]);
  });

  it('returns null gapMinutes for tasks with invalid timestamps', () => {
    const task = makeTask({ text: 'Valid', created_at: '2025-01-15T09:00:00Z' });
    const invalid = makeTask({ text: 'Invalid', created_at: 'not-a-date' });
    const results = findSameDayContext(task, [task, invalid]);
    // Invalid timestamps are excluded entirely
    expect(results).toEqual([]);
  });

  it('uses UTC dates for comparison', () => {
    // 23:00 UTC on Jan 15 is 00:00 CET on Jan 16
    const task = makeTask({ text: 'Late UTC', created_at: '2025-01-15T23:00:00Z' });
    const earlyUTC = makeTask({ text: 'Early UTC', created_at: '2025-01-15T08:00:00Z' });
    const results = findSameDayContext(task, [task, earlyUTC]);
    expect(results).toHaveLength(1);
    expect(results[0].task.text).toBe('Early UTC');
  });
});
