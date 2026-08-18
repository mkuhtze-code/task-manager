// lib/thinking/compose/userPatterns.ts
//
// Compose a user-level summary of interaction style from all completed
// tasks. This is NOT a personality profile — it's a description of how
// the person naturally uses Dokkit. The long-term objective: if the user
// almost never fills in a field, that field should become less prominent.

import type { CompletedTaskFacts, UserPatterns } from '../types';

export function buildUserPatterns(tasks: CompletedTaskFacts[]): UserPatterns | null {
  if (tasks.length === 0) return null;

  let cameUpCount = 0;
  let estimatedCount = 0;
  let scheduledCount = 0;
  let locatedCount = 0;
  let jobAttachedCount = 0;
  let subtaskCount = 0;
  let infoCount = 0;
  let timerUsedCount = 0;
  let totalRatio = 0;
  let ratioCount = 0;

  for (const t of tasks) {
    if (t.source === 'came_up') cameUpCount++;
    if (t.estimate_mins > 0) estimatedCount++;
    if (t.surface_date) scheduledCount++;
    if (t.location_text) locatedCount++;
    if (t.job_id) jobAttachedCount++;
    if (t.subtaskCount > 0) subtaskCount++;
    if (t.info && t.info.trim().length > 0) infoCount++;
    if (t.logged_mins > 0) timerUsedCount++;

    // Estimate accuracy — only for tasks with both estimate and actual
    if (t.estimate_mins > 0 && t.actual_mins != null) {
      totalRatio += t.actual_mins / t.estimate_mins;
      ratioCount++;
    }
  }

  const n = tasks.length;

  return {
    totalCompleted: n,
    avgEstimateAccuracy: ratioCount > 0 ? totalRatio / ratioCount : 1,
    cameUpRate: cameUpCount / n,
    estimatedRate: estimatedCount / n,
    scheduledRate: scheduledCount / n,
    locatedRate: locatedCount / n,
    jobAttachedRate: jobAttachedCount / n,
    subtaskUsageRate: subtaskCount / n,
    infoUsageRate: infoCount / n,
    timerUsageRate: timerUsedCount / n,
  };
}
