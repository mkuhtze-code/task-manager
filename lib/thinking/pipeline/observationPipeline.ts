// lib/thinking/pipeline/observationPipeline.ts
//
// Thinking Engine V2 — Observation Pipeline Coordinator
// Orchestrates candidate detection, evidence evaluation, deduplication, and ranking.

import type { CompletedTaskFacts } from '../types';
import type { EngineObservation, DetectorContext } from './types';
import { buildClusters, groupTasksByCluster, TaskCluster } from '../../taskIntelligence';
import { detectEstimateCalibration } from './detectors/estimateCalibration';
import { detectRepeatedCarryover } from './detectors/repeatedCarryover';
import { detectTimeOfDayPatterns } from './detectors/timeOfDay';
import { detectTaskContextPatterns } from './detectors/taskContext';
import { detectClusterPatterns } from './detectors/clusterPatterns';

export type GenerateObservationsOptions = {
  facts: CompletedTaskFacts[];
  precomputedClusters?: TaskCluster[];
  now?: Date;
  includeStale?: boolean;
};

const CONFIDENCE_WEIGHT = {
  high: 3,
  medium: 2,
  low: 1,
};

export function generateObservations(
  options: GenerateObservationsOptions
): EngineObservation[] {
  const { facts, precomputedClusters, now = new Date(), includeStale = false } = options;

  if (!facts || facts.length === 0) {
    return [];
  }

  // 1. Prepare historical tasks for clustering using existing infrastructure
  const historyForClustering = facts.map((f) => ({
    text: f.text,
    actual_mins: f.actual_mins || f.estimate_mins || 0,
    location_text: f.location_text,
    lat: f.lat,
    lng: f.lng,
    job_id: f.job_id,
    created_at: f.created_at,
  }));

  const clusters = precomputedClusters || buildClusters(historyForClustering);

  // Re-map tasks into TaskCluster membership
  const groupedTasks = groupTasksByCluster(facts, clusters);

  const context: DetectorContext = {
    facts,
    clusters: clusters.map((c) => ({
      label: c.label,
      tokens: c.tokens,
      count: c.count,
      totalMins: c.totalMins,
      avgMins: c.avgMins,
      location: c.location,
    })),
    groupedFacts: groupedTasks,
    now,
  };

  // 2. Run candidate detectors
  const rawObservations: EngineObservation[] = [
    ...detectEstimateCalibration(context),
    ...detectRepeatedCarryover(context),
    ...detectTimeOfDayPatterns(context),
    ...detectTaskContextPatterns(context),
    ...detectClusterPatterns(context),
  ];

  // 3. Filter stale observations unless explicitly requested
  let filtered = rawObservations;
  if (!includeStale) {
    filtered = rawObservations.filter((obs) => obs.status === 'active');
  }

  // 4. Deduplicate observations by ID
  const map = new Map<string, EngineObservation>();
  for (const obs of filtered) {
    const existing = map.get(obs.id);
    if (!existing) {
      map.set(obs.id, obs);
    } else {
      // Keep higher confidence & larger sample size
      const existingScore =
        CONFIDENCE_WEIGHT[existing.confidence] * 100 + existing.evidence.sampleCount;
      const newScore =
        CONFIDENCE_WEIGHT[obs.confidence] * 100 + obs.evidence.sampleCount;
      if (newScore > existingScore) {
        map.set(obs.id, obs);
      }
    }
  }

  const deduplicated = Array.from(map.values());

  // 5. Rank observations
  deduplicated.sort((a, b) => {
    // Active before stale
    if (a.status !== b.status) {
      return a.status === 'active' ? -1 : 1;
    }
    // Confidence weight descending
    const confDiff = CONFIDENCE_WEIGHT[b.confidence] - CONFIDENCE_WEIGHT[a.confidence];
    if (confDiff !== 0) return confDiff;

    // Sample count descending
    const sampleDiff = b.evidence.sampleCount - a.evidence.sampleCount;
    if (sampleDiff !== 0) return sampleDiff;

    // Consistency ratio descending
    const ratioDiff = b.evidence.consistencyRatio - a.evidence.consistencyRatio;
    if (ratioDiff !== 0) return ratioDiff;

    // Recency descending
    return (
      new Date(b.evidence.lastObservedAt).getTime() -
      new Date(a.evidence.lastObservedAt).getTime()
    );
  });

  return deduplicated;
}
