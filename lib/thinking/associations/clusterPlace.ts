// lib/thinking/associations/clusterPlace.ts
//
// Cluster × Place association: "Where does this activity tend to occur?"
//
// Groups tasks by coordinate proximity using areSamePlace (50m default).
// A cluster that repeatedly occurs at a single place has a strong
// spatial association with that place. Multiple distinct places are
// also valid — each becomes a separate association.
//
// Tasks without valid coordinates are excluded from spatial analysis.
// This prevents false-positive associations from absent data.

import type { CompletedTaskFacts } from '../types';
import { classifyConfidence } from '../confidence';
import { areSamePlace, DEFAULT_SAME_PLACE_THRESHOLD_M } from '../relationships/spatial';
import type { ClusterPlaceAssociation } from './types';

export const MIN_OBSERVATIONS_FOR_PLACE = 3;
export const MIN_RATIO_FOR_PLACE = 0.5;

/**
 * Determine spatial associations for a cluster.
 *
 * Groups tasks by coordinate proximity. For each group that meets the
 * evidence thresholds, produces a ClusterPlaceAssociation. A cluster
 * with all tasks at one place produces one association. A cluster
 * spread across two places produces two associations.
 *
 * Tasks without valid coordinates are counted in totalInCluster but
 * excluded from the spatial grouping and ratio calculation.
 */
export function findClusterPlaceAssociations(
  clusterLabel: string,
  tasks: CompletedTaskFacts[]
): ClusterPlaceAssociation[] {
  const totalInCluster = tasks.length;

  // Separate located tasks from the rest
  const located = tasks.filter(
    (t) =>
      t.lat != null &&
      t.lng != null &&
      Number.isFinite(t.lat) &&
      Number.isFinite(t.lng)
  );

  const totalWithCoordinates = located.length;
  if (totalWithCoordinates < MIN_OBSERVATIONS_FOR_PLACE) return [];

  // Group by coordinate proximity
  const groups: { tasks: CompletedTaskFacts[]; representativeText: string }[] = [];

  for (const task of located) {
    let matched = false;
    for (const group of groups) {
      const representative = group.tasks[0];
      if (
        areSamePlace(
          { lat: representative.lat!, lng: representative.lng! },
          { lat: task.lat!, lng: task.lng! }
        )
      ) {
        group.tasks.push(task);
        matched = true;
        break;
      }
    }
    if (!matched) {
      groups.push({ tasks: [task], representativeText: task.location_text ?? '(unknown)' });
    }
  }

  // Build associations for groups meeting thresholds
  const associations: ClusterPlaceAssociation[] = [];

  for (const group of groups) {
    const occurrenceCount = group.tasks.length;
    const ratio = occurrenceCount / totalWithCoordinates;

    if (ratio < MIN_RATIO_FOR_PLACE) continue;

    // Use the most frequent location_text in the group as representative
    const textCounts = new Map<string, number>();
    for (const t of group.tasks) {
      const text = t.location_text ?? '(unknown)';
      textCounts.set(text, (textCounts.get(text) ?? 0) + 1);
    }
    let bestText = group.representativeText;
    let bestCount = 0;
    for (const [text, count] of textCounts) {
      if (count > bestCount) {
        bestCount = count;
        bestText = text;
      }
    }

    associations.push({
      kind: 'cluster_place',
      clusterLabel,
      locationText: bestText,
      occurrenceCount,
      totalWithCoordinates,
      totalInCluster,
      ratio,
      confidence: classifyConfidence(occurrenceCount),
    });
  }

  return associations;
}
