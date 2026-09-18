import type { Task } from '@/lib/taskTypes';
import { fmtMins, fmtSurfaceDate, isScheduledForLater, localDateStr } from '@/lib/timeFormat';
import { capacityMinsForTask, buildRuntimeObservations } from '@/lib/dayFit';
import type { HistoricalTask, TaskCluster } from '@/lib/taskIntelligence';

// ── Derived Job state — everything the Jobs surfaces show is computed
// here from the Job's Tasks. Jobs carry no status, dates or estimates of
// their own, so none of these live in the database.

export function openTasksOf(jobTasks: Task[]): Task[] {
  return jobTasks.filter((t) => t.status !== 'done');
}

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
    const runtime =
      history.length > 0 ? buildRuntimeObservations(history) : null;
    const clusterList = clusters ?? runtime?.clusters;
    return open.reduce((sum, t) => {
      const { mins } = capacityMinsForTask(
        t,
        history,
        clusterList,
        Date.now(),
        runtime
      );
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
  if (open.length === 0) return '';
  const mins = jobRemainingMins(jobTasks, history, clusters);
  if (mins > 0) return fmtMins(mins);
  return open.length === 1 ? '1 open' : `${open.length} open`;
}

export function jobProgress(
  jobTasks: Task[],
  history: HistoricalTask[] = [],
  clusters?: TaskCluster[]
): { done: number; total: number; remainingMins: number } {
  const total = jobTasks.length;
  const done = jobTasks.filter((t) => t.status === 'done').length;
  const remainingMins = jobRemainingMins(jobTasks, history, clusters);
  return { done, total, remainingMins };
}

export function onTodayCount(jobTasks: Task[], todayStr?: string): number {
  const today = todayStr ?? localDateStr(new Date());
  return openTasksOf(jobTasks).filter((t) => !isScheduledForLater(t, today)).length;
}

export function jobNextTask(jobTasks: Task[], todayStr?: string): Task | null {
  const today = todayStr ?? localDateStr(new Date());
  const open = openTasksOf(jobTasks);
  if (open.length === 0) return null;
  const onToday = open.filter((t) => !isScheduledForLater(t, today));
  const pool = onToday.length > 0 ? onToday : open;
  return [...pool].sort((a, b) => a.order_index - b.order_index)[0] ?? null;
}

export function jobOverviewMeta(
  jobTasks: Task[],
  todayStr?: string
): { todayCount: number; nextLabel: string | null } {
  const today = todayStr ?? localDateStr(new Date());
  const todayCount = onTodayCount(jobTasks, today);
  const next = jobNextTask(jobTasks, today);
  const nextLabel = next
    ? next.text.length > 36
      ? next.text.slice(0, 35) + '…'
      : next.text
    : null;
  return { todayCount, nextLabel };
}

export function sortJobsForOverview<T extends { id: string; created_at: string }>(
  jobs: T[],
  tasksByJob: Record<string, Task[]>
): T[] {
  return [...jobs].sort((a, b) => {
    const aDone = isJobDone(tasksByJob[a.id] || []);
    const bDone = isJobDone(tasksByJob[b.id] || []);
    if (aDone !== bDone) return aDone ? 1 : -1;
    return b.created_at.localeCompare(a.created_at);
  });
}

export type JobTaskGroup = { label: string; tasks: Task[] };

export function groupJobTasks(jobTasks: Task[], todayStr: string): JobTaskGroup[] {
  const open = openTasksOf(jobTasks);
  const today: Task[] = [];
  const later: Task[] = [];
  const unscheduled: Task[] = [];

  for (const t of open) {
    if (t.surface_date && t.surface_date > todayStr) later.push(t);
    else if (t.surface_date === todayStr || t.due_today) today.push(t);
    else if (!t.surface_date) unscheduled.push(t);
    else today.push(t);
  }

  const groups: JobTaskGroup[] = [];
  if (today.length) groups.push({ label: 'Today', tasks: today });
  if (unscheduled.length) groups.push({ label: 'On the job', tasks: unscheduled });
  if (later.length) {
    later.sort((a, b) => (a.surface_date || '').localeCompare(b.surface_date || ''));
    groups.push({ label: 'Later', tasks: later });
  }
  return groups;
}

export function doneTasksOf(jobTasks: Task[]): Task[] {
  return jobTasks.filter((t) => t.status === 'done');
}

export function visibleNowOf(jobTasks: Task[], todayStr: string): Task[] {
  return openTasksOf(jobTasks).filter((t) => !isScheduledForLater(t, todayStr));
}
