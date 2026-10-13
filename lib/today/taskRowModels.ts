import type { TodayTaskRowModel } from '@/components/today/TodayTaskRows';
import { fmtMins } from '@/lib/timeFormat';
import {
  hasMeaningfulDivergence,
  suggestEstimate,
  type HistoricalTask,
} from '@/lib/taskIntelligence';
import type { Task, Subtask } from '@/lib/taskTypes';
import type { Job } from '@/lib/jobTypes';
import type { LiveDayPlan } from '@/lib/thinking/v3/liveDay';
import { estimateContextFrom } from '@/lib/today/useTodayIntelligence';

type DeriveTodayTaskRowsInput = {
  ordered: Task[];
  visibleTasks: Task[];
  subtasksByTask: Record<string, Subtask[]>;
  history: HistoricalTask[];
  clusters: ReturnType<typeof import('@/lib/taskIntelligence').buildClusters>;
  now: Date;
  taskCapacity: number;
  remainingForTask: (task: Task) => number;
  effectiveRemainingForTask: (task: Task) => number;
  liveDayPlan: LiveDayPlan;
  locatedIndexById: Record<string, number>;
  isRouteStop: (task: Task) => boolean;
  jobs: Job[];
  isDesktop: boolean;
  openTaskId: string | null;
  expandedId: string | null;
};

/**
 * Build the presentation-facing task rows for Today.
 * This is a projection only: ordering, fit decisions and task state remain
 * owned by their existing engines and the page's action handlers.
 */
export function deriveTodayTaskRowModels({
  ordered,
  visibleTasks,
  subtasksByTask,
  history,
  clusters,
  now,
  taskCapacity,
  remainingForTask,
  effectiveRemainingForTask,
  liveDayPlan,
  locatedIndexById,
  isRouteStop,
  jobs,
  isDesktop,
  openTaskId,
  expandedId,
}: DeriveTodayTaskRowsInput): TodayTaskRowModel[] {
  let cumulative = 0;
  const anyActive = visibleTasks.some(
    (task) => task.status === 'active' && task.estimate_mins > 0
  );

  return ordered.map((task, index) => {
    const remainingForThis = remainingForTask(task);
    cumulative += effectiveRemainingForTask(task);
    // List items (no estimate) never compete for timed capacity.
    const overCap = task.estimate_mins > 0 && cumulative > taskCapacity;
    const subs = subtasksByTask[task.id] || [];
    let liveLogged = task.logged_mins;
    if (task.status === 'active' && task.started_at) {
      liveLogged += (Date.now() - new Date(task.started_at).getTime()) / 60000;
    }

    const suggestion =
      task.estimate_mins > 0
        ? suggestEstimate(task.text, history, clusters, estimateContextFrom(task, now))
        : null;
    const learnedHint =
      suggestion && hasMeaningfulDivergence(task.estimate_mins, suggestion.suggestedMins)
        ? fmtMins(suggestion.suggestedMins)
        : null;
    const isLocated = isRouteStop(task);
    const locatedIdx = isLocated ? locatedIndexById[task.id] : -1;

    return {
      task,
      index,
      remainingForThis,
      liveLogged,
      overCap,
      fitLabel: liveDayPlan.byId[task.id]?.fitLabel ?? null,
      fitReason: liveDayPlan.byId[task.id]?.reason ?? null,
      anyActive,
      subs,
      learnedHint,
      jobLabel: jobs.find((job) => job.id === task.job_id)?.name ?? null,
      expanded: isDesktop ? openTaskId === task.id : expandedId === task.id,
      isLocated,
      locatedIdx,
    };
  });
}
