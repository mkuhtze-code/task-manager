import type { Task, Subtask } from '@/lib/taskTypes';
import type { HistoricalTask, TaskCluster } from '@/lib/taskIntelligence';
import { capacityMinsForTask } from '@/lib/dayFit';
import type { RuntimeObservations } from '@/lib/thinking/runtimeObservations';

/** Minutes already logged on completed subtasks for a parent task. */
export function completedSubtaskMins(
  taskId: string,
  subtasksByTask: Record<string, Subtask[]>
): number {
  return (subtasksByTask[taskId] || [])
    .filter((s) => s.done)
    .reduce((sum, s) => sum + s.mins, 0);
}

/**
 * Display-facing remaining time: driven purely by what the person typed.
 * Never silently changes — progress bar should always match what you set.
 */
export function remainingForTask(
  t: Task,
  subtasksByTask: Record<string, Subtask[]>,
  nowMs: number = Date.now()
): number {
  let logged = t.logged_mins;
  if (t.status === 'active' && t.started_at) {
    logged += (nowMs - new Date(t.started_at).getTime()) / 60000;
  }
  return Math.max(t.estimate_mins - logged - completedSubtaskMins(t.id, subtasksByTask), 0);
}

/**
 * Capacity-facing remaining time: blends typed estimate with history so
 * the ring, day rail, overflow flags, and capacity_first sort stay calibrated —
 * without changing the number shown on the task itself.
 */
export function effectiveRemainingForTask(
  t: Task,
  subtasksByTask: Record<string, Subtask[]>,
  history: HistoricalTask[],
  clusters: TaskCluster[],
  runtime: RuntimeObservations,
  nowMs: number = Date.now()
): number {
  const { mins } = capacityMinsForTask(t, history, clusters, nowMs, runtime);
  return Math.max(mins - completedSubtaskMins(t.id, subtasksByTask), 0);
}
