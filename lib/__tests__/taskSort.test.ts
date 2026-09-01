import { describe, it, expect } from 'vitest';
import { sortTasks } from '../taskSort';
import type { Task } from '../taskTypes';

function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-' + Math.random().toString(36).substring(2, 9),
    text: 'Test task',
    status: 'pending',
    source: 'planned',
    estimate_mins: 30,
    logged_mins: 0,
    started_at: null,
    due_today: false,
    order_index: 0,
    created_at: '2026-01-01T10:00:00Z',
    surface_date: null,
    location_text: null,
    lat: null,
    lng: null,
    drive_mins_to_next: 0,
    route_polyline: null,
    info: '',
    job_id: null,
    ...overrides,
  };
}

describe('sortTasks', () => {
  it('does not mutate the original array', () => {
    const t1 = createMockTask({ id: '1', order_index: 2 });
    const t2 = createMockTask({ id: '2', order_index: 1 });
    const original = [t1, t2];
    const originalCopy = [...original];

    const sorted = sortTasks(original, 'manual');

    expect(original).toEqual(originalCopy);
    expect(sorted).not.toBe(original);
  });

  it('handles empty task collections', () => {
    expect(sortTasks([], 'manual')).toEqual([]);
    expect(sortTasks([], 'capacity_first', () => 10, 60)).toEqual([]);
    expect(sortTasks([], 'oldest_first')).toEqual([]);
    expect(sortTasks([], 'newest_first')).toEqual([]);
  });

  describe('manual mode', () => {
    it('sorts tasks purely by order_index ascending', () => {
      const t1 = createMockTask({ id: '1', order_index: 3, due_today: true });
      const t2 = createMockTask({ id: '2', order_index: 1, due_today: false });
      const t3 = createMockTask({ id: '3', order_index: 2, due_today: true });

      const sorted = sortTasks([t1, t2, t3], 'manual');
      expect(sorted.map((t) => t.id)).toEqual(['2', '3', '1']);
    });
  });

  describe('oldest_first mode', () => {
    it('sorts tasks by created_at ascending', () => {
      const t1 = createMockTask({ id: '1', created_at: '2026-01-02T10:00:00Z' });
      const t2 = createMockTask({ id: '2', created_at: '2026-01-01T10:00:00Z' });
      const t3 = createMockTask({ id: '3', created_at: '2026-01-03T10:00:00Z' });

      const sorted = sortTasks([t1, t2, t3], 'oldest_first');
      expect(sorted.map((t) => t.id)).toEqual(['2', '1', '3']);
    });
  });

  describe('newest_first mode', () => {
    it('sorts tasks by created_at descending', () => {
      const t1 = createMockTask({ id: '1', created_at: '2026-01-02T10:00:00Z' });
      const t2 = createMockTask({ id: '2', created_at: '2026-01-01T10:00:00Z' });
      const t3 = createMockTask({ id: '3', created_at: '2026-01-03T10:00:00Z' });

      const sorted = sortTasks([t1, t2, t3], 'newest_first');
      expect(sorted.map((t) => t.id)).toEqual(['3', '1', '2']);
    });
  });

  describe('default / due_today_first mode', () => {
    it('places due_today tasks first, sorted by order_index within each group', () => {
      const t1 = createMockTask({ id: '1', due_today: false, order_index: 1 });
      const t2 = createMockTask({ id: '2', due_today: true, order_index: 2 });
      const t3 = createMockTask({ id: '3', due_today: true, order_index: 1 });
      const t4 = createMockTask({ id: '4', due_today: false, order_index: 0 });

      const sorted = sortTasks([t1, t2, t3, t4], 'due_today_first');
      expect(sorted.map((t) => t.id)).toEqual(['3', '2', '4', '1']);
    });

    it('handles completed, active, and pending tasks using standard ordering rules', () => {
      const t1 = createMockTask({ id: '1', status: 'done', order_index: 2, due_today: false });
      const t2 = createMockTask({ id: '2', status: 'active', order_index: 1, due_today: false });
      const t3 = createMockTask({ id: '3', status: 'pending', order_index: 0, due_today: false });

      const sorted = sortTasks([t1, t2, t3], 'due_today_first');
      expect(sorted.map((t) => t.id)).toEqual(['3', '2', '1']);
    });
  });

  describe('capacity_first mode', () => {
    const remainingFn = (t: Task) => Math.max(t.estimate_mins - t.logged_mins, 0);

    it('falls back to default ordering if remainingForTaskFn or taskCapacity is undefined', () => {
      const t1 = createMockTask({ id: '1', due_today: false, order_index: 1 });
      const t2 = createMockTask({ id: '2', due_today: true, order_index: 0 });

      const sortedNoFn = sortTasks([t1, t2], 'capacity_first', undefined, 60);
      expect(sortedNoFn.map((t) => t.id)).toEqual(['2', '1']);

      const sortedNoCap = sortTasks([t1, t2], 'capacity_first', remainingFn, undefined);
      expect(sortedNoCap.map((t) => t.id)).toEqual(['2', '1']);
    });

    it('separates timed tasks fitting in capacity from overflow and untimed list items', () => {
      const t1 = createMockTask({ id: '1', estimate_mins: 30, order_index: 0 });
      const t2 = createMockTask({ id: '2', estimate_mins: 40, order_index: 1 });
      const t3 = createMockTask({ id: '3', estimate_mins: 20, order_index: 2 });
      const listTask = createMockTask({ id: 'list', estimate_mins: 0, order_index: 3 });

      // Capacity = 60 mins.
      // Cumulative: t1 (30 <= 60 -> fits), t2 (30+40=70 > 60 -> overflow), t3 (70+20=90 > 60 -> overflow).
      // Untimed items placed at the bottom.
      const sorted = sortTasks([t1, t2, t3, listTask], 'capacity_first', remainingFn, 60);
      expect(sorted.map((t) => t.id)).toEqual(['1', '2', '3', 'list']);
    });

    it('handles exact boundary capacity fit (cumulative == taskCapacity)', () => {
      const t1 = createMockTask({ id: '1', estimate_mins: 30, order_index: 0 });
      const t2 = createMockTask({ id: '2', estimate_mins: 30, order_index: 1 });
      const t3 = createMockTask({ id: '3', estimate_mins: 15, order_index: 2 });

      // Capacity = 60 mins.
      // t1 (30 <= 60 -> fit), t2 (30+30=60 <= 60 -> fit), t3 (60+15=75 > 60 -> overflow).
      const sorted = sortTasks([t1, t2, t3], 'capacity_first', remainingFn, 60);
      expect(sorted.map((t) => t.id)).toEqual(['1', '2', '3']);
    });

    it('handles zero capacity available', () => {
      const t1 = createMockTask({ id: '1', estimate_mins: 15, order_index: 0 });
      const t2 = createMockTask({ id: '2', estimate_mins: 20, order_index: 1 });

      // Capacity = 0. All timed tasks go to overflow.
      const sorted = sortTasks([t1, t2], 'capacity_first', remainingFn, 0);
      expect(sorted.map((t) => t.id)).toEqual(['1', '2']);
    });

    it('accounts for logged_mins when determining remaining time', () => {
      const t1 = createMockTask({ id: '1', estimate_mins: 60, logged_mins: 40, order_index: 0 }); // remaining: 20
      const t2 = createMockTask({ id: '2', estimate_mins: 60, logged_mins: 20, order_index: 1 }); // remaining: 40
      const t3 = createMockTask({ id: '3', estimate_mins: 30, logged_mins: 0, order_index: 2 });  // remaining: 30

      // Capacity = 60.
      // t1 (remaining 20 <= 60 -> fit)
      // t2 (20+40 = 60 <= 60 -> fit)
      // t3 (60+30 = 90 > 60 -> overflow)
      const sorted = sortTasks([t1, t2, t3], 'capacity_first', remainingFn, 60);
      expect(sorted.map((t) => t.id)).toEqual(['1', '2', '3']);
    });

    it('respects due_today priority before capacity calculation', () => {
      const tNormal = createMockTask({ id: 'normal', due_today: false, estimate_mins: 30, order_index: 0 });
      const tDueToday = createMockTask({ id: 'due', due_today: true, estimate_mins: 40, order_index: 1 });

      // Initial ordering places due_today first: [tDueToday (40m), tNormal (30m)].
      // Capacity = 50.
      // tDueToday (40 <= 50 -> fit)
      // tNormal (40+30 = 70 > 50 -> overflow)
      const sorted = sortTasks([tNormal, tDueToday], 'capacity_first', remainingFn, 50);
      expect(sorted.map((t) => t.id)).toEqual(['due', 'normal']);
    });

    it('places untimed list items (estimate_mins <= 0) at the bottom in due_today/order_index sequence', () => {
      const untimedDue = createMockTask({ id: 'u1', estimate_mins: 0, due_today: true, order_index: 0 });
      const untimedNotDue = createMockTask({ id: 'u2', estimate_mins: -5, due_today: false, order_index: 1 });
      const timed = createMockTask({ id: 't1', estimate_mins: 30, due_today: false, order_index: 0 });

      const sorted = sortTasks([untimedNotDue, untimedDue, timed], 'capacity_first', remainingFn, 100);
      expect(sorted.map((t) => t.id)).toEqual(['t1', 'u1', 'u2']);
    });
  });
});
