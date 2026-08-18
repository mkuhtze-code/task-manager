import { describe, it, expect } from 'vitest';
import type { CompletedTaskFacts } from '../types';
import {
  taskIdentifier,
  orderChronologically,
  buildAdjacencyPairs,
  aggregateAdjacency,
} from '../relationships/sequencing';

function makeTask(overrides: Partial<CompletedTaskFacts> = {}): CompletedTaskFacts {
  return {
    text: 'Test task',
    status: 'done',
    source: 'planned',
    estimate_mins: 60,
    actual_mins: 60,
    logged_mins: 60,
    created_at: '2026-03-15T10:00:00Z',
    completed_at: '2026-03-15T11:00:00Z',
    started_at: '2026-03-15T10:00:00Z',
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

describe('taskIdentifier', () => {
  it('returns the task text', () => {
    expect(taskIdentifier(makeTask({ text: 'Site visit Henderson' }))).toBe(
      'Site visit Henderson'
    );
  });

  it('returns text even with special characters', () => {
    expect(taskIdentifier(makeTask({ text: 'Quote — Reroof (£500)' }))).toBe(
      'Quote — Reroof (£500)'
    );
  });
});

describe('orderChronologically', () => {
  it('sorts by created_at ascending', () => {
    const tasks = [
      makeTask({ text: 'B', created_at: '2026-03-15T12:00:00Z' }),
      makeTask({ text: 'A', created_at: '2026-03-15T08:00:00Z' }),
    ];
    const ordered = orderChronologically(tasks);
    expect(ordered[0].text).toBe('A');
    expect(ordered[1].text).toBe('B');
  });

  it('breaks ties alphabetically by text', () => {
    const tasks = [
      makeTask({ text: 'Cherry', created_at: '2026-03-15T10:00:00Z' }),
      makeTask({ text: 'Apple', created_at: '2026-03-15T10:00:00Z' }),
      makeTask({ text: 'Banana', created_at: '2026-03-15T10:00:00Z' }),
    ];
    const ordered = orderChronologically(tasks);
    expect(ordered.map((t) => t.text)).toEqual(['Apple', 'Banana', 'Cherry']);
  });

  it('does not mutate the input array', () => {
    const tasks = [
      makeTask({ text: 'B', created_at: '2026-03-15T12:00:00Z' }),
      makeTask({ text: 'A', created_at: '2026-03-15T08:00:00Z' }),
    ];
    const original = [...tasks];
    orderChronologically(tasks);
    expect(tasks[0].text).toBe(original[0].text);
    expect(tasks[1].text).toBe(original[1].text);
  });

  it('places null created_at at the end', () => {
    const tasks = [
      makeTask({ text: 'No timestamp', created_at: '' }),
      makeTask({ text: 'Has timestamp', created_at: '2026-03-15T10:00:00Z' }),
    ];
    const ordered = orderChronologically(tasks);
    expect(ordered[0].text).toBe('Has timestamp');
    expect(ordered[1].text).toBe('No timestamp');
  });

  it('returns empty array for empty input', () => {
    expect(orderChronologically([])).toEqual([]);
  });

  it('returns single task unchanged', () => {
    const task = makeTask({ text: 'Only one' });
    const ordered = orderChronologically([task]);
    expect(ordered).toHaveLength(1);
    expect(ordered[0].text).toBe('Only one');
  });

  it('handles same-day different times', () => {
    const tasks = [
      makeTask({ text: 'Morning', created_at: '2026-03-15T07:00:00Z' }),
      makeTask({ text: 'Afternoon', created_at: '2026-03-15T14:00:00Z' }),
      makeTask({ text: 'Evening', created_at: '2026-03-15T19:00:00Z' }),
    ];
    const ordered = orderChronologically(tasks);
    expect(ordered.map((t) => t.text)).toEqual([
      'Morning',
      'Afternoon',
      'Evening',
    ]);
  });
});

describe('buildAdjacencyPairs', () => {
  it('builds pairs from same-day tasks', () => {
    const tasks = [
      makeTask({ text: 'Material run', created_at: '2026-03-15T07:00:00Z' }),
      makeTask({ text: 'Site visit', created_at: '2026-03-15T08:00:00Z' }),
    ];
    const pairs = buildAdjacencyPairs(tasks);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].preceding).toBe('Material run');
    expect(pairs[0].following).toBe('Site visit');
    expect(pairs[0].date).toBe('2026-03-15');
    expect(pairs[0].gapMinutes).toBe(60);
  });

  it('builds multiple pairs for same-day chain', () => {
    const tasks = [
      makeTask({ text: 'A', created_at: '2026-03-15T07:00:00Z' }),
      makeTask({ text: 'B', created_at: '2026-03-15T08:00:00Z' }),
      makeTask({ text: 'C', created_at: '2026-03-15T09:00:00Z' }),
    ];
    const pairs = buildAdjacencyPairs(tasks);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].preceding).toBe('A');
    expect(pairs[0].following).toBe('B');
    expect(pairs[1].preceding).toBe('B');
    expect(pairs[1].following).toBe('C');
  });

  it('does not build pairs across days', () => {
    const tasks = [
      makeTask({ text: 'A', created_at: '2026-03-15T23:00:00Z' }),
      makeTask({ text: 'B', created_at: '2026-03-16T01:00:00Z' }),
    ];
    const pairs = buildAdjacencyPairs(tasks);
    expect(pairs).toHaveLength(0);
  });

  it('returns empty for empty input', () => {
    expect(buildAdjacencyPairs([])).toEqual([]);
  });

  it('returns empty for single task', () => {
    const tasks = [makeTask({ text: 'A', created_at: '2026-03-15T10:00:00Z' })];
    expect(buildAdjacencyPairs(tasks)).toHaveLength(0);
  });

  it('filters tasks with invalid created_at', () => {
    const tasks = [
      makeTask({ text: 'A', created_at: '' }),
      makeTask({ text: 'B', created_at: '2026-03-15T10:00:00Z' }),
      makeTask({ text: 'C', created_at: '2026-03-15T11:00:00Z' }),
    ];
    const pairs = buildAdjacencyPairs(tasks);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].preceding).toBe('B');
    expect(pairs[0].following).toBe('C');
  });

  it('handles zero-minute gap', () => {
    const tasks = [
      makeTask({ text: 'A', created_at: '2026-03-15T10:00:00Z' }),
      makeTask({ text: 'B', created_at: '2026-03-15T10:00:00Z' }),
    ];
    const pairs = buildAdjacencyPairs(tasks);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].gapMinutes).toBe(0);
  });

  it('handles tasks on different days as separate groups', () => {
    const tasks = [
      makeTask({ text: 'A', created_at: '2026-03-15T10:00:00Z' }),
      makeTask({ text: 'B', created_at: '2026-03-15T11:00:00Z' }),
      makeTask({ text: 'C', created_at: '2026-03-16T10:00:00Z' }),
      makeTask({ text: 'D', created_at: '2026-03-16T11:00:00Z' }),
    ];
    const pairs = buildAdjacencyPairs(tasks);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].date).toBe('2026-03-15');
    expect(pairs[1].date).toBe('2026-03-16');
  });

  it('same-day three tasks produce two pairs', () => {
    const tasks = [
      makeTask({ text: 'Material run', created_at: '2026-03-15T07:00:00Z' }),
      makeTask({ text: 'Site visit', created_at: '2026-03-15T08:00:00Z' }),
      makeTask({ text: 'Admin', created_at: '2026-03-15T16:00:00Z' }),
    ];
    const pairs = buildAdjacencyPairs(tasks);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toEqual({
      preceding: 'Material run',
      following: 'Site visit',
      date: '2026-03-15',
      gapMinutes: 60,
    });
    expect(pairs[1]).toEqual({
      preceding: 'Site visit',
      following: 'Admin',
      date: '2026-03-15',
      gapMinutes: 480,
    });
  });
});

describe('aggregateAdjacency', () => {
  it('counts repeated pairs', () => {
    const pairs = [
      { preceding: 'A', following: 'B', date: '2026-03-15', gapMinutes: 60 },
      { preceding: 'A', following: 'B', date: '2026-03-16', gapMinutes: 60 },
      { preceding: 'A', following: 'B', date: '2026-03-17', gapMinutes: 60 },
      { preceding: 'A', following: 'C', date: '2026-03-18', gapMinutes: 30 },
    ];
    const agg = aggregateAdjacency(pairs);
    expect(agg).toHaveLength(2);
    expect(agg[0].preceding).toBe('A');
    expect(agg[0].following).toBe('B');
    expect(agg[0].count).toBe(3);
    expect(agg[0].occurrences).toHaveLength(3);
    expect(agg[1].preceding).toBe('A');
    expect(agg[1].following).toBe('C');
    expect(agg[1].count).toBe(1);
  });

  it('sorts by count descending', () => {
    const pairs = [
      { preceding: 'X', following: 'Y', date: '2026-03-15', gapMinutes: 10 },
      { preceding: 'A', following: 'B', date: '2026-03-15', gapMinutes: 10 },
      { preceding: 'A', following: 'B', date: '2026-03-16', gapMinutes: 10 },
    ];
    const agg = aggregateAdjacency(pairs);
    expect(agg[0].count).toBe(2);
    expect(agg[1].count).toBe(1);
  });

  it('sorts alphabetically on count tie', () => {
    const pairs = [
      { preceding: 'B', following: 'A', date: '2026-03-15', gapMinutes: 10 },
      { preceding: 'A', following: 'B', date: '2026-03-15', gapMinutes: 10 },
    ];
    const agg = aggregateAdjacency(pairs);
    expect(agg[0].preceding).toBe('A');
    expect(agg[1].preceding).toBe('B');
  });

  it('returns empty for empty input', () => {
    expect(aggregateAdjacency([])).toEqual([]);
  });

  it('retains occurrence evidence', () => {
    const pairs = [
      { preceding: 'A', following: 'B', date: '2026-03-15', gapMinutes: 60 },
      { preceding: 'A', following: 'B', date: '2026-03-20', gapMinutes: 45 },
    ];
    const agg = aggregateAdjacency(pairs);
    expect(agg[0].occurrences[0].date).toBe('2026-03-15');
    expect(agg[0].occurrences[1].date).toBe('2026-03-20');
  });
});
