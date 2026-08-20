// lib/thinking/observations/planningBehaviour.ts
//
// Observation: how does the user typically interact with task input?
// This is NOT personality profiling — it's a description of interaction
// patterns that emerge from ordinary use. The long-term objective is:
// if the user almost never fills in a field, that field should eventually
// become less prominent.

import type { CompletedTaskFacts, PlanningObservation } from '../types';
import { classifyConfidence } from '../confidence';

export function observePlanning(tasks: CompletedTaskFacts[]): PlanningObservation | null {
  if (tasks.length === 0) return null;

  let cameUpCount = 0;
  let estimatedCount = 0;
  let scheduledCount = 0;
  let locatedCount = 0;
  let jobAttachedCount = 0;
  let infoCount = 0;
  let timerUsedCount = 0;

  for (const t of tasks) {
    if (t.source === 'came_up') cameUpCount++;
    if (t.estimate_mins > 0) estimatedCount++;
    if (t.surface_date) scheduledCount++;
    if (t.location_text) locatedCount++;
    if (t.job_id) jobAttachedCount++;
    if (t.info && t.info.trim().length > 0) infoCount++;
    if (t.logged_mins > 0) timerUsedCount++;
  }

  const n = tasks.length;
  const confidence = classifyConfidence(n);

  return {
    kind: 'planning',
    clusterLabel: null,
    cameUpRate: cameUpCount / n,
    estimatedRate: estimatedCount / n,
    scheduledRate: scheduledCount / n,
    locatedRate: locatedCount / n,
    jobAttachedRate: jobAttachedCount / n,
    infoRate: infoCount / n,
    timerUsedRate: timerUsedCount / n,
    sampleCount: n,
    confidence,
    observedAt: new Date().toISOString(),
  };
}

export function observeClusterPlanning(
  tasks: CompletedTaskFacts[],
  clusterLabel: string
): PlanningObservation | null {
  const obs = observePlanning(tasks);
  if (obs) obs.clusterLabel = clusterLabel;
  return obs;
}
