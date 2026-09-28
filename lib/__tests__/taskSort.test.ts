import { describe, it, expect } from 'vitest';
import { sortTasks } from '../taskSort';
import type { Task } from '@/lib/taskTypes';

function task(partial: Partial<Task> & { id: string; text: string }): Task {
  return {
    user_id: 'u',
    status: 'pending',
    estimate_mins: 30,
    actual_mins: null,
    logged_mins: null,
    order_index: 0,
    due_today: false,
    surface_date: null,
    location_text: null,
    lat: null,
    lng: null,
    job_id: null,
    intended_time: null,
    started_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
    ...partial,
  } as Task;
}

describe('sortTasks capacity_first', () => {
  it('uses preferredOrderIds before cumulative capacity split', () => {
    const a = task({ id: 'a', text: 'A', estimate_mins: 40, order_index: 0 });
    const b = task({ id: 'b', text: 'B', estimate_mins: 40, order_index: 1 });
    const c = task({ id: 'c', text: 'C', estimate_mins: 40, order_index: 2 });
    const remaining = () => 40;
    // Prefer c, then a, then b — only first item fits in 50 mins capacity
    const ordered = sortTasks(
      [a, b, c],
      'capacity_first',
      remaining,
      50,
      ['c', 'a', 'b']
    );
    expect(ordered.map((t) => t.id)).toEqual(['c', 'a', 'b']);
    // c fits; a and b overflow but keep preferred relative order
  });

  it('keeps list items (zero estimate) at the bottom', () => {
    const timed = task({ id: 't', text: 'Timed', estimate_mins: 20 });
    const list = task({ id: 'l', text: 'List', estimate_mins: 0, order_index: 0 });
    const ordered = sortTasks([list, timed], 'capacity_first', () => 20, 30, null);
    expect(ordered.map((t) => t.id)).toEqual(['t', 'l']);
  });
});
