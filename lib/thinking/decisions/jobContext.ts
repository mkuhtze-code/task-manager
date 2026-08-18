// lib/thinking/decisions/jobContext.ts
//
// Decision 1: Job Context Suggestion
//
// Given a task and all available contextual evidence, determines whether
// Dokkit has enough independent evidence to suggest a job assignment.
//
// This is a DECISION, not an interpretation. The output must never assign
// job_id. The user remains able to reject or replace the suggestion.
//
// Evidence dimensions remain independent:
//   - direct:   tasks in this cluster that already carry job_id = X
//   - spatial:  unlinked tasks within 50m of job X activity
//   - temporal: unlinked tasks on the same day as job X activity
//   - sequence: unlinked tasks adjacent to job X activity within a day
//
// For contextual inference (unlinked tasks), at least 2 independent
// dimensions must agree before a suggestion is made. Single-dimension
// evidence is insufficient — it could be coincidental.
//
// If the task already has a job_id, returns null.
// If there is no viable candidate job, returns null.
// If evidence conflicts between candidates, returns null.
// If there is a tie between candidates, returns null.
//
// All decisions are deterministic. Same input → identical output.

import type { CompletedTaskFacts, JobContextDecision, Confidence, DecisionAuthority } from '../types';
import type { ClusterJobAssociation } from '../associations/types';
import type { CoOccurrenceContext } from '../context/types';
import { classifyConfidence } from '../confidence';

// ── Minimum evidence per dimension for unlinked tasks ────────────
// Each independent contextual dimension must meet its own threshold
// before it can contribute to a multi-dimensional agreement.

export const MIN_SPATIAL_COUNT = 2;
export const MIN_TEMPORAL_COUNT = 2;
export const MIN_SEQUENCE_COUNT = 2;

// ── Minimum agreeing dimensions ──────────────────────────────────
// At least 2 independent dimensions must agree for unlinked tasks.
// Direct job_id evidence is treated as its own dimension.

export const MIN_AGREEING_DIMENSIONS = 2;

// ── Authority from confidence ─────────────────────────────────────

function authorityFromConfidence(confidence: Confidence): DecisionAuthority {
  if (confidence === 'high') return 'strong';
  if (confidence === 'medium') return 'suggest';
  return 'observe';
}

// ── Dimension check helpers ──────────────────────────────────────

function hasSpatialEvidence(e: ClusterJobAssociation['evidence']): boolean {
  return e.spatial.count >= MIN_SPATIAL_COUNT && e.spatial.total > 0;
}

function hasTemporalEvidence(e: ClusterJobAssociation['evidence']): boolean {
  return e.temporal.count >= MIN_TEMPORAL_COUNT && e.temporal.total > 0;
}

function hasSequenceEvidence(e: ClusterJobAssociation['evidence']): boolean {
  return e.sequence.count >= MIN_SEQUENCE_COUNT && e.sequence.total > 0;
}

function hasDirectEvidence(e: ClusterJobAssociation['evidence']): boolean {
  return e.direct.count > 0;
}

// ── Count agreeing dimensions ────────────────────────────────────

function countAgreeingDimensions(
  evidence: ClusterJobAssociation['evidence']
): ('direct' | 'spatial' | 'temporal' | 'sequence')[] {
  const dims: ('direct' | 'spatial' | 'temporal' | 'sequence')[] = [];
  if (hasDirectEvidence(evidence)) dims.push('direct');
  if (hasSpatialEvidence(evidence)) dims.push('spatial');
  if (hasTemporalEvidence(evidence)) dims.push('temporal');
  if (hasSequenceEvidence(evidence)) dims.push('sequence');
  return dims;
}

// ── Main decision function ───────────────────────────────────────
//
// Consumes the task to evaluate, all tasks in the same cluster, and
// the pre-computed Scope 3B job associations for that cluster.
//
// Also accepts the full task list for co-occurrence context when
// the task is unlinked and needs per-task spatial/temporal evidence
// that the cluster-level associations don't capture.

export function decideJobContext(
  task: CompletedTaskFacts,
  clusterTasks: CompletedTaskFacts[],
  jobAssociations: ClusterJobAssociation[],
): JobContextDecision | null {
  // ── User override: task already has a job_id ──────────────
  if (task.job_id) return null;

  // ── No associations → no candidate jobs ────────────────────
  if (jobAssociations.length === 0) return null;

  // ── Single candidate path ──────────────────────────────────
  if (jobAssociations.length === 1) {
    return evaluateCandidate(jobAssociations[0], clusterTasks.length);
  }

  // ── Multiple candidates: require single unambiguous winner ─
  const evaluated = jobAssociations
    .map((a) => ({ association: a, decision: evaluateCandidate(a, clusterTasks.length) }))
    .filter((e): e is { association: ClusterJobAssociation; decision: JobContextDecision } => e.decision !== null);

  if (evaluated.length === 0) return null;
  if (evaluated.length > 1) return null; // tie or conflict

  return evaluated[0].decision;
}

// ── Evaluate a single candidate ──────────────────────────────────

function evaluateCandidate(
  association: ClusterJobAssociation,
  clusterSize: number,
): JobContextDecision | null {
  const { evidence, jobId, confidence: _confidence } = association;

  // Direct evidence: tasks in this cluster already carry job_id.
  // This is the strongest signal — the user has manually linked
  // similar tasks to this job before.
  if (hasDirectEvidence(evidence)) {
    const confidence = classifyConfidence(evidence.direct.count);
    const agreeingDimensions: ('direct' | 'spatial' | 'temporal' | 'sequence')[] = ['direct'];

    // Also check what other dimensions agree
    if (hasSpatialEvidence(evidence)) agreeingDimensions.push('spatial');
    if (hasTemporalEvidence(evidence)) agreeingDimensions.push('temporal');
    if (hasSequenceEvidence(evidence)) agreeingDimensions.push('sequence');

    return {
      kind: 'job_context',
      jobId,
      confidence,
      authority: authorityFromConfidence(confidence),
      evidence,
      agreeingDimensions,
    };
  }

  // Contextual evidence: unlinked tasks. Require at least
  // MIN_AGREEING_DIMENSIONS independent dimensions to agree.
  const agreeingDimensions = countAgreeingDimensions(evidence);

  if (agreeingDimensions.length < MIN_AGREEING_DIMENSIONS) return null;

  // Confidence from the strongest agreeing dimension's count
  const counts = agreeingDimensions.map((d) => evidence[d].count);
  const maxCount = Math.max(...counts);
  const confidence = classifyConfidence(maxCount);

  return {
    kind: 'job_context',
    jobId,
    confidence,
    authority: authorityFromConfidence(confidence),
    evidence,
    agreeingDimensions,
  };
}
