// lib/thinking/context/temporal.ts
//
// Factual same-day relationships between a specific task and all other tasks.
// Uses the existing Scope 3A isSameDay() and groupByDate() primitives.
// Answers "what else happened on this day?" without inferring significance.

import type { CompletedTaskFacts } from '../types';
import type { SameDayRelationship } from './types';
import { isSameDay } from '../relationships/temporal';

/**
 * Find all other tasks created on the same UTC calendar day.
 *
 * Returns tasks ordered by created_at ascending (earliest first).
 * Excludes the task itself from results.
 * Returns empty array if the task has no valid created_at.
 * Returns empty array if no other tasks share the same day.
 *
 * This is a factual query. It does not interpret whether the
 * same-day co-occurrence is meaningful or whether the tasks
 * are related.
 */
export function findSameDayContext(
  task: CompletedTaskFacts,
  allTasks: CompletedTaskFacts[]
): SameDayRelationship[] {
  if (task.created_at == null) return [];
  const taskDate = new Date(task.created_at);
  if (Number.isNaN(taskDate.getTime())) return [];

  const results: SameDayRelationship[] = [];

  for (const other of allTasks) {
    if (other === task) continue;
    if (other.created_at == null) continue;
    if (Number.isNaN(new Date(other.created_at).getTime())) continue;

    if (isSameDay(task.created_at, other.created_at)) {
      const taskTime = taskDate.getTime();
      const otherTime = new Date(other.created_at).getTime();
      const gapMs = otherTime - taskTime;
      const gapMinutes =
        gapMs >= 0 ? Math.round(gapMs / 60_000) : null;

      results.push({ task: other, gapMinutes });
    }
  }

  results.sort((a, b) => {
    const aTime = new Date(a.task.created_at!).getTime();
    const bTime = new Date(b.task.created_at!).getTime();
    return aTime - bTime;
  });

  return results;
}
