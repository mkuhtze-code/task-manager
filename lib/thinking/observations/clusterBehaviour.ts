// lib/thinking/observations/clusterBehaviour.ts
//
// Observation: per-cluster behavioural analysis. Given a set of tasks
// that belong to the same cluster, produce a single observation that
// captures the cluster's behavioural fingerprint — lifecycle, decomposition,
// planning, and location patterns.

import type { CompletedTaskFacts, ClusterBehaviourObservation } from '../types';
import { classifyConfidence } from '../confidence';

const MS_PER_DAY = 86_400_000;

export function observeClusterBehaviour(
  tasks: CompletedTaskFacts[],
  clusterLabel: string
): ClusterBehaviourObservation | null {
  if (tasks.length === 0) return null;

  let totalMins = 0;
  let totalAgeDays = 0;
  let sameDayCount = 0;
  let decomposeCount = 0;
  let locatedCount = 0;
  let jobCount = 0;
  let cameUpCount = 0;
  let totalSubtaskCount = 0;

  const now = Date.now();

  for (const t of tasks) {
    const actual = t.actual_mins ?? t.estimate_mins;
    totalMins += actual;

    const ageDays = (now - new Date(t.created_at).getTime()) / MS_PER_DAY;
    totalAgeDays += ageDays;

    if (t.completed_at && sameDay(t.created_at, t.completed_at)) {
      sameDayCount++;
    }
    if (t.subtaskCount > 0) decomposeCount++;
    if (t.location_text) locatedCount++;
    if (t.job_id) jobCount++;
    if (t.source === 'came_up') cameUpCount++;
    totalSubtaskCount += t.subtaskCount;
  }

  const n = tasks.length;
  const confidence = classifyConfidence(n);

  return {
    kind: 'cluster_behaviour',
    clusterLabel,
    count: n,
    avgMins: totalMins / n,
    avgAgeDays: totalAgeDays / n,
    sameDayRate: sameDayCount / n,
    decomposeRate: decomposeCount / n,
    locatedRate: locatedCount / n,
    jobRate: jobCount / n,
    cameUpRate: cameUpCount / n,
    avgSubtaskCount: totalSubtaskCount / n,
    confidence,
    observedAt: new Date().toISOString(),
  };
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}
