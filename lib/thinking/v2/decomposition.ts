import { CompletedTaskFacts } from '../types';
import { toLocalDate } from './timezone';
import { emitProportionObservation, buildProportionEvidence } from './proportion';
import { StructuredObservation } from './observations';

/**
 * Decomposition detector (V2).
 *
 * Observes whether tasks tend to be broken down into subtasks.
 *
 * Compared to the weak V1 `decomposition` (which reported a raw decomposeRate
 * with no baseline or missing-data handling), this V2 version:
 *   - Uses a legitimate baseline for "breaks tasks down" (50%).
 *   - Computes a normalised effect magnitude and consistency.
 *   - Never fabricates from a zero denominator.
 */

const DECOMPOSE_BASELINE = 0.5;

export function observeV2Decomposition(
  tasks: CompletedTaskFacts[],
): StructuredObservation[] {
  const out: StructuredObservation[] = [];
  if (tasks.length === 0) return out;

  const total = tasks.length;
  const decomposeCount = tasks.filter((t) => t.subtaskCount > 0).length;

  const obs = emitProportionObservation({
    type: 'decomposition',
    semanticType: 'decomposition:rate',
    title: 'Complex tasks are usually broken into subtasks',
    description: `Across ${total} completed tasks, ${decomposeCount} (${Math.round((decomposeCount / total) * 100)}%) were broken down into subtasks.`,
    count: decomposeCount,
    total,
    baseline: DECOMPOSE_BASELINE,
    traceability: {
      taskIds: [],
      taskTexts: tasks.map((t) => t.text),
      detectionSource: 'decomposition.rate',
    },
  });
  if (obs) out.push(obs);

  return out;
}

export { buildProportionEvidence };
