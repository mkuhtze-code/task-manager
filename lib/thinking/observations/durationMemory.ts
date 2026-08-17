// lib/thinking/observations/durationMemory.ts
//
// Observation: what has the engine learned about how long a cluster
// of similar tasks takes? Produces DurationMemoryObservation records
// that capture the cluster's current state, trend, and confidence.

import type { DurationMemoryObservation, Confidence } from '../types';
import { classifyConfidence } from '../confidence';
import { averageDuration, detectTrend } from '../memory';

export function observeDurationMemory(params: {
  clusterLabel: string;
  actuals: number[];
}): DurationMemoryObservation {
  const { clusterLabel, actuals } = params;
  const avgMins = averageDuration(actuals);
  const totalMins = actuals.reduce((a, b) => a + b, 0);
  const lastActualMins = actuals[actuals.length - 1];
  const confidence = classifyConfidence(actuals.length);
  const trend = detectTrend(actuals);

  return {
    kind: 'duration_memory',
    clusterLabel,
    clusterCount: actuals.length,
    avgMins,
    totalMins,
    lastActualMins,
    trend,
    confidence,
    observedAt: new Date().toISOString(),
  };
}

// ── Batch observation from cluster data ───────────────────────────
// Given a map of cluster labels to their completion histories,
// produce one DurationMemoryObservation per cluster.

export function observeAllClusters(
  clusters: Map<string, number[]>
): DurationMemoryObservation[] {
  const observations: DurationMemoryObservation[] = [];
  for (const [label, actuals] of clusters) {
    if (actuals.length >= 2) {
      observations.push(observeDurationMemory({ clusterLabel: label, actuals }));
    }
  }
  return observations;
}
