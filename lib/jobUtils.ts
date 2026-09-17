import type { Task } from '@/lib/taskTypes';
import { fmtMins, fmtSurfaceDate, isScheduledForLater, localDateStr } from '@/lib/timeFormat';
import { capacityMinsForTask } from '@/lib/dayFit';
import type { HistoricalTask, TaskCluster } from '@/lib/taskIntelligence';

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

/**
 * Remaining capacity minutes across open tasks.
 * Uses dayFit when history is provided so untimed work doesn't read as zero.
 * Falls back to typed estimate − logged when history is omitted.
 */
export function jobRemainingMins(
  jobTasks: Task[],
  history: HistoricalTask[] = [],
  clusters?: TaskCluster[]
): number {
  const open = openTasksOf(jobTasks);
  if (open.length === 0) return 0;

  if (history.length > 0 || clusters) {
    return open.reduce((sum, t) => {
      const { mins } = capacityMinsForTask(t, history, clusters);
      return sum + mins;
    }, 0);
  }

  return open.reduce(
    (sum, t) => sum + Math.max(t.estimate_mins - t.logged_mins, 0),
    0
  );
}

// The one mono numeral for an overview row: remaining time across open
// Tasks (falling back to the open-Task count when there's no timed or
// inferred work to add up). Prefer passing history so untimed tasks still
// contribute a soft capacity cost.
export function jobNumeral(
  jobTasks: Task[],
  history: HistoricalTask[] = [],
  clusters?: TaskCluster[]
): string {
  const open = openTasksOf(jobTasks);
  if (open.length === 0) return '0';

  const remaining = jobRemainingMins(jobTasks, history, clusters);
  const anyTimed = open.some((t) => t.estimate_mins > 0);
  const anyInferred = history.length > 0 || !!clusters;

  if (anyTimed || anyInferred) {
    if (remaining > 0) return fmtMins(remaining);
  }
  return String(open.length);
}

// Derived progress line for the Job detail head: "3 of 8 · 2h 40m left".
export function jobProgress(
  jobTasks: Task[],
  history: HistoricalTask[] = [],
  clusters?: TaskCluster[]
): { done: number; total: number; remainingMins: number; openCount: number } {
  const done = jobTasks.filter((t) => t.status === 'done').length;
  const total = jobTasks.length;
  const openCount = openTasksOf(jobTasks).length;
  const remainingMins = jobRemainingMins(jobTasks, history, clusters);
  return { done, total, remainingMins, openCount };
}

/** Open tasks that are live on Today (not scheduled for a future surface_date). */
export function onTodayCount(jobTasks: Task[], todayStr?: string): number {
  const today = todayStr ?? localDateStr(new Date());
  return openTasksOf(jobTasks).filter((t) => !isScheduledForLater(t, today)).length;
}

/**
 * Quiet "next" line for overview / detail: prefer something already on
 * Today, else first undated, else earliest future surface_date.
 */
export function jobNextTask(jobTasks: Task[], todayStr?: string): Task | null {
  const today = todayStr ?? localDateStr(new Date());
  const open = openTasksOf(jobTasks).sort((a, b) => {
    if (a.order_index !== b.order_index) return a.order_index - b.order_index;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  if (open.length === 0) return null;

  const onToday = open.filter((t) => !isScheduledForLater(t, today));
  if (onToday.length > 0) return onToday[0];

  const undated = open.filter((t) => !t.surface_date);
  if (undated.length > 0) return undated[0];

  return open[0];
}

/** Secondary overview line: client · N on today · next action. */
export function jobOverviewMeta(
  job: { client: string | null; location_text: string | null },
  jobTasks: Task[],
  todayStr?: string
): { clientLine: string | null; onToday: number; nextLabel: string | null } {
  const today = todayStr ?? localDateStr(new Date());
  const onToday = onTodayCount(jobTasks, today);
  const next = jobNextTask(jobTasks, today);
  const nextLabel = next
    ? next.text.length > 48
      ? next.text.slice(0, 47) + '\u2026'
      : next.text
    : null;

  const clientLine =
    job.client && job.client.trim().length > 0 ? job.client.trim() : null;

  return { clientLine, onToday, nextLabel };
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
// piece of work spread across days.
export function groupJobTasks(jobTasks: Task[], todayStr: string): JobTaskGroup[] {
  const open = openTasksOf(jobTasks).sort(byOrder);
  const today = open.filter((t) => t.surface_date && t.surface_date <= todayStr);
  const undated = open.filter((t) => !t.surface_date);

  const groups: JobTaskGroup[] = [];
  if (today.length > 0) {
    groups.push({ kind: 'today', label: 'On for today', tasks: today });
  }

  const dates = [
    ...new Set(
      open
        .filter((t) => t.surface_date && t.surface_date > todayStr)
        .map((t) => t.surface_date as string)
    ),
  ].sort();
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

export function visibleNowOf(jobTasks: Task[], todayStr: string): Task[] {
  return openTasksOf(jobTasks).filter((t) => !isScheduledForLater(t, todayStr));
}
