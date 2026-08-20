import type { Task } from '@/lib/taskTypes';
import { fmtMins, fmtSurfaceDate, isScheduledForLater } from '@/lib/timeFormat';

// ── Derived Job state — everything the Jobs surfaces show is computed
// here from the Job's Tasks. Jobs carry no status, dates or estimates of
// their own, so none of these live in the database.

// Tasks that still count as open work for a Job.
export function openTasksOf(jobTasks: Task[]): Task[] {
  return jobTasks.filter((t) => t.status !== 'done');
}

// A Job is "done" only when it has Tasks and every one of them is done.
// An empty Job (no Tasks yet) is not done — it's a fresh piece of work.
export function isJobDone(jobTasks: Task[]): boolean {
  return jobTasks.length > 0 && jobTasks.every((t) => t.status === 'done');
}

// The one mono numeral for an overview row: remaining estimated time across
// open Tasks (falling back to the open-Task count when there's no timed work
// to add up). Mirrors how Today's rows and Travel's fit pill speak time.
export function jobNumeral(jobTasks: Task[]): string {
  const open = openTasksOf(jobTasks);
  const timed = open.filter((t) => t.estimate_mins > 0);
  if (timed.length > 0) {
    const remaining = open.reduce(
      (sum, t) => sum + Math.max(t.estimate_mins - t.logged_mins, 0),
      0
    );
    return fmtMins(remaining);
  }
  return String(open.length);
}

// Derived progress line for the Job detail head: "3 of 8 · 2h 40m left".
export function jobProgress(jobTasks: Task[]): { done: number; total: number; remainingMins: number } {
  const done = jobTasks.filter((t) => t.status === 'done').length;
  const total = jobTasks.length;
  const remainingMins = openTasksOf(jobTasks).reduce(
    (sum, t) => sum + Math.max(t.estimate_mins - t.logged_mins, 0),
    0
  );
  return { done, total, remainingMins };
}

// Overview ordering: open Jobs first, completed Jobs last; newest created
// first within each group.
export function sortJobsForOverview<T extends { id: string; created_at: string }>(
  jobs: T[],
  tasksByJob: Record<string, Task[]>
): T[] {
  return [...jobs].sort((a, b) => {
    const aDone = isJobDone(tasksByJob[a.id] || []);
    const bDone = isJobDone(tasksByJob[b.id] || []);
    if (aDone !== bDone) return aDone ? 1 : -1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export type JobTaskGroup =
  | { kind: 'today'; label: string; tasks: Task[] }
  | { kind: 'later'; label: string; tasks: Task[] }
  | { kind: 'none'; label: string; tasks: Task[] };

function byOrder(a: Task, b: Task): number {
  if (a.order_index !== b.order_index) return a.order_index - b.order_index;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

// Groups a Job's open Tasks by surface state so the detail page reads as a
// piece of work spread across days:
//   "On for today"  — dated for today (or already surfaced) — what Today
//                     is showing right now
//   future dates    — one quiet group per upcoming surface_date
//   "No date"       — undated Tasks; still live on Today, just not pinned
//                     to a day on the Job page
export function groupJobTasks(jobTasks: Task[], todayStr: string): JobTaskGroup[] {
  const open = openTasksOf(jobTasks).sort(byOrder);
  const today = open.filter((t) => t.surface_date && t.surface_date <= todayStr);
  const undated = open.filter((t) => !t.surface_date);

  const groups: JobTaskGroup[] = [];
  if (today.length > 0) {
    groups.push({ kind: 'today', label: 'On for today', tasks: today });
  }

  const dates = [...new Set(open.filter((t) => t.surface_date && t.surface_date > todayStr).map((t) => t.surface_date as string))].sort();
  for (const date of dates) {
    const later = open.filter((t) => t.surface_date === date);
    if (later.length > 0) {
      groups.push({ kind: 'later', label: fmtSurfaceDate(date), tasks: later });
    }
  }

  if (undated.length > 0) {
    groups.push({ kind: 'none', label: 'No date', tasks: undated });
  }

  return groups;
}

export function doneTasksOf(jobTasks: Task[]): Task[] {
  return jobTasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// Tasks that have surfaced (or are undated) — what Today shows now. Used to
// state the Jobs↔Today relationship in the detail view.
export function visibleNowOf(jobTasks: Task[], todayStr: string): Task[] {
  return openTasksOf(jobTasks).filter((t) => !isScheduledForLater(t, todayStr));
}
