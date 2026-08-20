// lib/thinking/associations/clusterJob.ts
//
// Cluster × Job association: "Which jobs share contextual evidence with
// this activity cluster?"
//
// Evidence is kept strictly independent across four dimensions:
//
//   direct    — tasks already carrying job_id = X
//   spatial   — unlinked tasks within 50m of job X activity
//   temporal  — unlinked tasks on the same day as job X activity
//   sequence  — unlinked tasks adjacent to job X activity within a day
//
// A single unlinked task may satisfy spatial, temporal, AND sequence
// simultaneously. That is one task with three evidence signals, NOT
// three independent observations. The dimensions are reported
// separately. The caller must NOT sum them into a composite score.
//
// The denominator for each unlinked dimension is the count of unlinked
// tasks (those without any job_id) in the cluster. This measures what
// fraction of unlinked tasks exhibit contextual proximity to a specific
// job — the question Scope 3B is actually answering.

import type { CompletedTaskFacts } from '../types';
import { classifyConfidence } from '../confidence';
import { areSamePlace } from '../relationships/spatial';
import { isSameDay } from '../relationships/temporal';
import { buildAdjacencyPairs } from '../relationships/sequencing';
import type { ClusterJobAssociation, ClusterJobEvidence } from './types';

export const MIN_TOTAL_FOR_JOB = 4;

/**
 * Determine job associations for a cluster.
 *
 * For each job_id represented in the cluster (directly or contextually),
 * computes four independent evidence dimensions. Only produces an
 * association when at least one dimension has count > 0.
 *
 * Direct evidence uses the total cluster as denominator.
 * Unlinked evidence (spatial/temporal/sequence) uses the count of
 * unlinked tasks as denominator — these are the tasks whose job
 * association is being assessed.
 */
export function findClusterJobAssociations(
  clusterLabel: string,
  tasks: CompletedTaskFacts[]
): ClusterJobAssociation[] {
  if (tasks.length < MIN_TOTAL_FOR_JOB) return [];

  // Identify all job_ids present in the cluster
  const jobIds = new Set<string>();
  for (const t of tasks) {
    if (t.job_id) jobIds.add(t.job_id);
  }
  if (jobIds.size === 0) return [];

  // Separate linked from unlinked tasks
  const linked = tasks.filter((t) => t.job_id);
  const unlinked = tasks.filter((t) => !t.job_id);
  const unlinkedWithCoords = unlinked.filter(
    (t) =>
      t.lat != null &&
      t.lng != null &&
      Number.isFinite(t.lat) &&
      Number.isFinite(t.lng)
  );
  const unlinkedWithTimestamp = unlinked.filter(
    (t) => t.created_at && !Number.isNaN(new Date(t.created_at).getTime())
  );

  // Build adjacency pairs from all tasks (for sequence evidence)
  const allPairs = buildAdjacencyPairs(tasks);

  const associations: ClusterJobAssociation[] = [];

  for (const jobId of jobIds) {
    // ── Direct evidence ───────────────────────────────────────
    const directCount = linked.filter((t) => t.job_id === jobId).length;

    // ── Spatial evidence ──────────────────────────────────────
    // Find the representative coordinates for this job's activity
    const jobTasks = linked.filter((t) => t.job_id === jobId);
    const jobCoords = jobTasks
      .filter((t) => t.lat != null && t.lng != null)
      .map((t) => ({ lat: t.lat!, lng: t.lng! }));

    let spatialCount = 0;
    if (jobCoords.length > 0) {
      for (const t of unlinkedWithCoords) {
        const taskCoord = { lat: t.lat!, lng: t.lng! };
        if (jobCoords.some((jc) => areSamePlace(jc, taskCoord))) {
          spatialCount++;
        }
      }
    }

    // ── Temporal evidence ─────────────────────────────────────
    // Find days when this job had activity
    const jobDays = new Set(
      jobTasks
        .filter((t) => t.created_at)
        .map((t) => t.created_at.slice(0, 10))
    );

    let temporalCount = 0;
    for (const t of unlinkedWithTimestamp) {
      const taskDay = t.created_at.slice(0, 10);
      if (jobDays.has(taskDay)) {
        temporalCount++;
      }
    }

    // ── Sequence evidence ─────────────────────────────────────
    // Find unlinked tasks that are adjacent (same day) to job-linked tasks
    const jobTexts = new Set(jobTasks.map((t) => t.text));
    const adjacentUnlinkedTexts = new Set<string>();

    for (const pair of allPairs) {
      const aIsJob = jobTexts.has(pair.preceding);
      const bIsJob = jobTexts.has(pair.following);
      const aIsUnlinked = unlinkedWithTimestamp.some((t) => t.text === pair.preceding);
      const bIsUnlinked = unlinkedWithTimestamp.some((t) => t.text === pair.following);

      if (aIsJob && bIsUnlinked) adjacentUnlinkedTexts.add(pair.following);
      if (bIsJob && aIsUnlinked) adjacentUnlinkedTexts.add(pair.preceding);
    }

    let sequenceCount = 0;
    for (const t of unlinkedWithTimestamp) {
      if (adjacentUnlinkedTexts.has(t.text)) sequenceCount++;
    }

    // Only produce an association if at least one dimension has evidence
    const hasEvidence =
      directCount > 0 ||
      spatialCount > 0 ||
      temporalCount > 0 ||
      sequenceCount > 0;

    if (!hasEvidence) continue;

    const evidence: ClusterJobEvidence = {
      direct: { count: directCount, total: tasks.length },
      spatial: {
        count: spatialCount,
        total: unlinkedWithCoords.length,
      },
      temporal: {
        count: temporalCount,
        total: unlinkedWithTimestamp.length,
      },
      sequence: {
        count: sequenceCount,
        total: unlinkedWithTimestamp.length,
      },
    };

    // Confidence from the strongest evidence dimension's sample count
    const maxCount = Math.max(directCount, spatialCount, temporalCount, sequenceCount);

    associations.push({
      kind: 'cluster_job',
      clusterLabel,
      jobId,
      evidence,
      confidence: classifyConfidence(maxCount),
    });
  }

  return associations;
}
