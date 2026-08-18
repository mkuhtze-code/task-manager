// lib/thinking/observations/decomposition.ts
//
// Observation: does this kind of work get broken down into subtasks?
// Answers questions like:
//   - What proportion of tasks generate subtask lists?
//   - How many subtasks on average?
//   - Are subtasks completed when the parent completes?

import type { CompletedTaskFacts, DecompositionObservation } from '../types';
import { classifyConfidence } from '../confidence';

export function observeDecomposition(tasks: CompletedTaskFacts[]): DecompositionObservation | null {
  if (tasks.length === 0) return null;

  let decomposeCount = 0;
  let totalSubtaskCount = 0;
  let totalSubtaskMins = 0;
  let totalSubtaskDoneCount = 0;
  let totalSubtaskTotalCount = 0;

  for (const t of tasks) {
    if (t.subtaskCount > 0) {
      decomposeCount++;
    }
    totalSubtaskCount += t.subtaskCount;
    totalSubtaskMins += t.subtaskTotalMins;
    totalSubtaskDoneCount += t.subtaskDoneCount;
    totalSubtaskTotalCount += t.subtaskCount;
  }

  const n = tasks.length;
  const confidence = classifyConfidence(n);

  return {
    kind: 'decomposition',
    clusterLabel: null,
    decomposeRate: decomposeCount / n,
    avgSubtaskCount: totalSubtaskCount / n,
    avgSubtaskMins: totalSubtaskMins / n,
    subtaskCompletionRate: totalSubtaskTotalCount > 0
      ? totalSubtaskDoneCount / totalSubtaskTotalCount
      : 0,
    sampleCount: n,
    confidence,
    observedAt: new Date().toISOString(),
  };
}

export function observeClusterDecomposition(
  tasks: CompletedTaskFacts[],
  clusterLabel: string
): DecompositionObservation | null {
  const obs = observeDecomposition(tasks);
  if (obs) obs.clusterLabel = clusterLabel;
  return obs;
}
