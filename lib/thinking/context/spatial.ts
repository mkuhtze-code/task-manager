// lib/thinking/context/spatial.ts
//
// Factual spatial relationships between a specific task and all other tasks.
// Uses the existing Scope 3A distanceMeters() primitive. Answers
// "what is nearby?" without inferring why the proximity matters.

import type { CompletedTaskFacts } from '../types';
import type { SpatialRelationship } from './types';
import {
  distanceMeters,
  DEFAULT_SAME_PLACE_THRESHOLD_M,
} from '../relationships/spatial';

/**
 * Find all tasks within `thresholdMeters` of the given task.
 *
 * Returns tasks sorted by distance ascending (nearest first).
 * Excludes the task itself from results.
 * Returns empty array if the task has no valid coordinates.
 * Returns empty array if no other tasks are within range.
 *
 * This is a factual query. It does not interpret why the tasks
 * are close together or whether the proximity is meaningful.
 */
export function findSpatialContext(
  task: CompletedTaskFacts,
  allTasks: CompletedTaskFacts[],
  thresholdMeters: number = DEFAULT_SAME_PLACE_THRESHOLD_M
): SpatialRelationship[] {
  if (task.lat == null || task.lng == null) return [];
  if (!Number.isFinite(task.lat) || !Number.isFinite(task.lng)) return [];

  const results: SpatialRelationship[] = [];

  for (const other of allTasks) {
    if (other === task) continue;
    if (other.lat == null || other.lng == null) continue;
    if (!Number.isFinite(other.lat) || !Number.isFinite(other.lng)) continue;

    const dist = distanceMeters(
      { lat: task.lat, lng: task.lng },
      { lat: other.lat, lng: other.lng }
    );

    if (dist <= thresholdMeters) {
      results.push({ task: other, distanceMeters: dist });
    }
  }

  results.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return results;
}
