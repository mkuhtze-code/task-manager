// lib/thinking/observations/staleness.ts
//
// Observation: does this kind of task tend to go stale?
// A task is considered "stale" if it's older than a threshold and
// still not completed. This module observes staleness patterns across
// completed and pending tasks.

import type { CompletedTaskFacts, StalenessObservation } from '../types';
import { classifyConfidence } from '../confidence';

const MS_PER_DAY = 86_400_000;

// Threshold for "stale": tasks older than this that are still pending.
const STALE_THRESHOLD_DAYS = 3;

export function observeStaleness(
  allTasks: CompletedTaskFacts[],
  now: Date = new Date()
): StalenessObservation | null {
  if (allTasks.length === 0) return null;

  const nowMs = now.getTime();
  let totalAgeDays = 0;
  let staleCount = 0;
  let completedCount = 0;
  let completedWereOldCount = 0;

  for (const t of allTasks) {
    const ageMs = nowMs - new Date(t.created_at).getTime();
    const ageDays = ageMs / MS_PER_DAY;
    totalAgeDays += ageDays;

    if (t.status === 'done' && t.completed_at) {
      completedCount++;
      // Was this task old when it completed?
      if (ageDays > STALE_THRESHOLD_DAYS) {
        completedWereOldCount++;
      }
    } else {
      // Still pending/active — is it stale?
      if (ageDays > STALE_THRESHOLD_DAYS) {
        staleCount++;
      }
    }
  }

  const n = allTasks.length;
  const pendingCount = n - completedCount;
  const confidence = classifyConfidence(n);

  return {
    kind: 'staleness',
    clusterLabel: null,
    avgAgeDays: totalAgeDays / n,
    staleRate: pendingCount > 0 ? staleCount / pendingCount : 0,
    completionAfterStallRate: completedCount > 0 ? completedWereOldCount / completedCount : 0,
    sampleCount: n,
    confidence,
    observedAt: new Date().toISOString(),
  };
}

export function observeClusterStaleness(
  tasks: CompletedTaskFacts[],
  clusterLabel: string,
  now: Date = new Date()
): StalenessObservation | null {
  const obs = observeStaleness(tasks, now);
  if (obs) obs.clusterLabel = clusterLabel;
  return obs;
}
