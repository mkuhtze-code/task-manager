import { describe, it, expect } from 'vitest';
import {
  openTasksOf,
  isJobDone,
  jobNumeral,
  jobProgress,
  sortJobsForOverview,
  groupJobTasks,
  doneTasksOf,
  visibleNowOf,
} from '../jobUtils';
import type { Task } from '../taskTypes';

function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-' + Math.random().toString(36).substring(2, 9),
    text: 'Job task',
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
    job_id: 'job-1',
    ...overrides,
  };
}

describe('jobUtils', () => {
  describe('openTasksOf', () => {
    it('filters out completed tasks and returns pending and active tasks', () => {
      const t1 = createMockTask({ id: '1', status: 'pending' });
      const t2 = createMockTask({ id: '2', status: 'active' });
      const t3 = createMockTask({ id: '3', status: 'done' });

      expect(openTasksOf([t1, t2, t3])).toEqual([t1, t2]);
    });

    it('returns empty array when input is empty or all tasks are done', () => {
      expect(openTasksOf([])).toEqual([]);
      const t1 = createMockTask({ status: 'done' });
      expect(openTasksOf([t1])).toEqual([]);
    });
  });

  describe('isJobDone', () => {
    it('returns false for an empty job (no tasks yet)', () => {
      expect(isJobDone([])).toBe(false);
    });

    it('returns false if any task is not done', () => {
      const t1 = createMockTask({ status: 'done' });
      const t2 = createMockTask({ status: 'pending' });
      expect(isJobDone([t1, t2])).toBe(false);
    });

    it('returns true when non-empty and every task is done', () => {
      const t1 = createMockTask({ status: 'done' });
      const t2 = createMockTask({ status: 'done' });
      expect(isJobDone([t1, t2])).toBe(true);
    });
  });

  describe('jobNumeral', () => {
    it('returns string count of open tasks when there are no timed open tasks (estimate_mins <= 0)', () => {
      const t1 = createMockTask({ status: 'pending', estimate_mins: 0 });
      const t2 = createMockTask({ status: 'active', estimate_mins: 0 });
      const t3 = createMockTask({ status: 'done', estimate_mins: 30 }); // Done task ignored

      expect(jobNumeral([t1, t2, t3])).toBe('2');
    });

    it('returns formatted remaining time sum when there are open timed tasks', () => {
      const t1 = createMockTask({ status: 'pending', estimate_mins: 45, logged_mins: 15 }); // 30m remaining
      const t2 = createMockTask({ status: 'active', estimate_mins: 60, logged_mins: 0 });  // 1h remaining
      const t3 = createMockTask({ status: 'pending', estimate_mins: 0 });                  // untimed

      // Remaining sum = 30 + 60 = 90 mins -> '1h 30m'
      expect(jobNumeral([t1, t2, t3])).toBe('1h 30m');
    });

    it('clamps negative remaining time per task to 0 when logged_mins > estimate_mins', () => {
      const t1 = createMockTask({ status: 'pending', estimate_mins: 30, logged_mins: 50 }); // max(30-50, 0) = 0
      const t2 = createMockTask({ status: 'pending', estimate_mins: 20, logged_mins: 5 });  // max(20-5, 0) = 15

      expect(jobNumeral([t1, t2])).toBe('15m');
    });
  });

  describe('jobProgress', () => {
    it('computes correct done count, total count, and total remaining minutes across open tasks', () => {
      const t1 = createMockTask({ status: 'done', estimate_mins: 30, logged_mins: 30 });
      const t2 = createMockTask({ status: 'pending', estimate_mins: 60, logged_mins: 15 }); // 45 remaining
      const t3 = createMockTask({ status: 'active', estimate_mins: 20, logged_mins: 0 });  // 20 remaining

      const progress = jobProgress([t1, t2, t3]);
      expect(progress).toEqual({
        done: 1,
        total: 3,
        remainingMins: 65,
      });
    });

    it('handles empty task list gracefully', () => {
      expect(jobProgress([])).toEqual({ done: 0, total: 0, remainingMins: 0 });
    });
  });

  describe('sortJobsForOverview', () => {
    it('places open jobs first and completed jobs last, sorting by created_at descending within groups', () => {
      const jobs = [
        { id: 'job-open-old', created_at: '2026-01-01T10:00:00Z' },
        { id: 'job-done-new', created_at: '2026-01-05T10:00:00Z' },
        { id: 'job-open-new', created_at: '2026-01-03T10:00:00Z' },
        { id: 'job-done-old', created_at: '2026-01-02T10:00:00Z' },
      ];

      const doneTask = createMockTask({ status: 'done' });
      const openTask = createMockTask({ status: 'pending' });

      const tasksByJob = {
        'job-open-old': [openTask],
        'job-done-new': [doneTask],
        'job-open-new': [openTask],
        'job-done-old': [doneTask],
      };

      const sorted = sortJobsForOverview(jobs, tasksByJob);
      expect(sorted.map((j) => j.id)).toEqual([
        'job-open-new',
        'job-open-old',
        'job-done-new',
        'job-done-old',
      ]);
    });
  });

  describe('groupJobTasks', () => {
    const todayStr = '2026-08-25';

    it('groups open tasks into today, upcoming dates, and no date', () => {
      const tToday = createMockTask({ id: 'today', surface_date: '2026-08-25', order_index: 0 });
      const tPast = createMockTask({ id: 'past', surface_date: '2026-08-20', order_index: 1 });
      const tLater1 = createMockTask({ id: 'later1', surface_date: '2026-08-28', order_index: 0 });
      const tLater2 = createMockTask({ id: 'later2', surface_date: '2026-08-26', order_index: 0 });
      const tUndated = createMockTask({ id: 'undated', surface_date: null, order_index: 0 });
      const tDone = createMockTask({ id: 'done', status: 'done', surface_date: '2026-08-25' });

      const groups = groupJobTasks([tToday, tPast, tLater1, tLater2, tUndated, tDone], todayStr);

      expect(groups.length).toBe(4);
      expect(groups[0]).toMatchObject({ kind: 'today', label: 'On for today' });
      expect(groups[0].tasks.map((t) => t.id)).toEqual(['today', 'past']);

      // Upcoming dates should be sorted chronologically
      expect(groups[1].kind).toBe('later');
      expect(groups[1].tasks.map((t) => t.id)).toEqual(['later2']);

      expect(groups[2].kind).toBe('later');
      expect(groups[2].tasks.map((t) => t.id)).toEqual(['later1']);

      expect(groups[3]).toMatchObject({ kind: 'none', label: 'No date' });
      expect(groups[3].tasks.map((t) => t.id)).toEqual(['undated']);
    });

    it('returns empty groups array if job has no open tasks', () => {
      const tDone = createMockTask({ status: 'done' });
      expect(groupJobTasks([tDone], todayStr)).toEqual([]);
    });
  });

  describe('doneTasksOf', () => {
    it('returns only done tasks sorted by created_at descending', () => {
      const t1 = createMockTask({ id: '1', status: 'done', created_at: '2026-01-01T10:00:00Z' });
      const t2 = createMockTask({ id: '2', status: 'done', created_at: '2026-01-03T10:00:00Z' });
      const t3 = createMockTask({ id: '3', status: 'pending', created_at: '2026-01-02T10:00:00Z' });

      const done = doneTasksOf([t1, t2, t3]);
      expect(done.map((t) => t.id)).toEqual(['2', '1']);
    });
  });

  describe('visibleNowOf', () => {
    const todayStr = '2026-08-25';

    it('returns open tasks that are not scheduled for a future date', () => {
      const tUndated = createMockTask({ id: 'undated', surface_date: null });
      const tToday = createMockTask({ id: 'today', surface_date: '2026-08-25' });
      const tPast = createMockTask({ id: 'past', surface_date: '2026-08-20' });
      const tFuture = createMockTask({ id: 'future', surface_date: '2026-08-30' });
      const tDone = createMockTask({ id: 'done', status: 'done', surface_date: null });

      const visible = visibleNowOf([tUndated, tToday, tPast, tFuture, tDone], todayStr);
      expect(visible.map((t) => t.id)).toEqual(['undated', 'today', 'past']);
    });
  });
});
