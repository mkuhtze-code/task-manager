import { describe, it, expect } from 'vitest';
import { findSequenceContext } from '../context/sequencing';
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

describe('findSequenceContext', () => {
  it('returns empty when task has no created_at', () => {
    const task = makeTask({ text: 'No timestamp', created_at: '' });
    const other = makeTask({ text: 'Other' });
    const result = findSequenceContext(task, [task, other]);
    expect(result.preceding).toEqual([]);
    expect(result.following).toEqual([]);
  });

  it('returns empty when task is the only task on its day', () => {
    const task = makeTask({ text: 'Solo', created_at: '2025-01-15T09:00:00Z' });
    const result = findSequenceContext(task, [task]);
    expect(result.preceding).toEqual([]);
    expect(result.following).toEqual([]);
  });

  it('finds preceding task', () => {
    const task = makeTask({ text: 'Middle', created_at: '2025-01-15T12:00:00Z' });
    const before = makeTask({ text: 'Before', created_at: '2025-01-15T09:00:00Z' });
    const result = findSequenceContext(task, [task, before]);
    expect(result.preceding).toHaveLength(1);
    expect(result.preceding[0].task.text).toBe('Before');
    expect(result.following).toEqual([]);
  });

  it('finds following task', () => {
    const task = makeTask({ text: 'Middle', created_at: '2025-01-15T12:00:00Z' });
    const after = makeTask({ text: 'After', created_at: '2025-01-15T15:00:00Z' });
    const result = findSequenceContext(task, [task, after]);
    expect(result.preceding).toEqual([]);
    expect(result.following).toHaveLength(1);
    expect(result.following[0].task.text).toBe('After');
  });

  it('finds both preceding and following tasks', () => {
    const task = makeTask({ text: 'Middle', created_at: '2025-01-15T12:00:00Z' });
    const before = makeTask({ text: 'Before', created_at: '2025-01-15T09:00:00Z' });
    const after = makeTask({ text: 'After', created_at: '2025-01-15T15:00:00Z' });
    const result = findSequenceContext(task, [task, before, after]);
    expect(result.preceding).toHaveLength(1);
    expect(result.preceding[0].task.text).toBe('Before');
    expect(result.following).toHaveLength(1);
    expect(result.following[0].task.text).toBe('After');
  });

  it('only finds immediate neighbours (consecutive adjacency)', () => {
    const task = makeTask({ text: 'Middle', created_at: '2025-01-15T12:00:00Z' });
    const before1 = makeTask({ text: 'Before1', created_at: '2025-01-15T08:00:00Z' });
    const before2 = makeTask({ text: 'Before2', created_at: '2025-01-15T09:00:00Z' });
    const after1 = makeTask({ text: 'After1', created_at: '2025-01-15T15:00:00Z' });
    const after2 = makeTask({ text: 'After2', created_at: '2025-01-15T18:00:00Z' });

    const result = findSequenceContext(task, [task, before1, before2, after1, after2]);
    // Should only find immediate neighbours
    expect(result.preceding).toHaveLength(1);
    expect(result.preceding[0].task.text).toBe('Before2');
    expect(result.following).toHaveLength(1);
    expect(result.following[0].task.text).toBe('After1');
  });

  it('calculates gapMinutes correctly', () => {
    const task = makeTask({ text: 'Task', created_at: '2025-01-15T09:00:00Z' });
    const before = makeTask({ text: 'Before', created_at: '2025-01-15T08:00:00Z' });
    const after = makeTask({ text: 'After', created_at: '2025-01-15T10:30:00Z' });

    const result = findSequenceContext(task, [task, before, after]);
    expect(result.preceding[0].gapMinutes).toBe(60);
    expect(result.following[0].gapMinutes).toBe(90);
  });

  it('handles tasks on different days', () => {
    const task = makeTask({ text: 'Jan 15', created_at: '2025-01-15T09:00:00Z' });
    const otherDay = makeTask({ text: 'Jan 16', created_at: '2025-01-16T09:00:00Z' });
    const result = findSequenceContext(task, [task, otherDay]);
    expect(result.preceding).toEqual([]);
    expect(result.following).toEqual([]);
  });

  it('handles identical timestamps', () => {
    const task = makeTask({ text: 'A', created_at: '2025-01-15T09:00:00Z' });
    const sameTime = makeTask({ text: 'B', created_at: '2025-01-15T09:00:00Z' });
    const result = findSequenceContext(task, [task, sameTime]);
    // With identical timestamps, order is alphabetical
    // A (text "A") and B (text "B") → A precedes B
    expect(result.preceding).toHaveLength(0);
    expect(result.following).toHaveLength(1);
    expect(result.following[0].task.text).toBe('B');
  });

  it('handles empty allTasks array', () => {
    const task = makeTask({ text: 'Solo' });
    const result = findSequenceContext(task, []);
    expect(result.preceding).toEqual([]);
    expect(result.following).toEqual([]);
  });

  it('handles invalid timestamp gracefully', () => {
    const task = makeTask({ text: 'Invalid', created_at: 'not-a-date' });
    const other = makeTask({ text: 'Other' });
    const result = findSequenceContext(task, [task, other]);
    expect(result.preceding).toEqual([]);
    expect(result.following).toEqual([]);
  });

  it('preserves deterministic tie-break (alphabetical)', () => {
    // Tasks with same timestamp are ordered alphabetically
    const task = makeTask({ text: 'B', created_at: '2025-01-15T09:00:00Z' });
    const a = makeTask({ text: 'A', created_at: '2025-01-15T09:00:00Z' });
    const c = makeTask({ text: 'C', created_at: '2025-01-15T09:00:00Z' });

    const result = findSequenceContext(task, [task, a, c]);
    // A (alphabetically before B) precedes B
    expect(result.preceding).toHaveLength(1);
    expect(result.preceding[0].task.text).toBe('A');
    // C (alphabetically after B) follows B
    expect(result.following).toHaveLength(1);
    expect(result.following[0].task.text).toBe('C');
  });
});
