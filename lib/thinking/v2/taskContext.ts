import { CompletedTaskFacts } from '../types';
import { emitProportionObservation, buildProportionEvidence } from './proportion';
import { StructuredObservation } from './observations';

/**
 * Task-context / planning-behaviour detector (V2).
 *
 * Example claims this detector can support:
 *   - "Most tasks are planned in advance rather than captured on the fly."
 *   - "You usually attach an estimate when capturing tasks."
 *
 * Compared to the weak V1 `planningBehaviour` (which simply reported rates
 * with no baseline or effect), this V2 version:
 *   - Uses a legitimate baseline (e.g. 50% for a two-way planned/came_up
 *     split) rather than reporting an unanchored percentage.
 *   - Computes a normalised effect magnitude and consistency.
 *   - Tracks missing data (null/empty fields) and never fabricates a rate
 *     from a zero denominator.
 *   - Uses descriptive, non-causal wording.
 */

const RATE_BASELINE = 0.5;

export interface TaskContextObservation {
  structured: StructuredObservation;
  rate: number;
  effect: number;
}

export function observeV2TaskContext(tasks: CompletedTaskFacts[]): StructuredObservation[] {
  const out: StructuredObservation[] = [];
  if (tasks.length === 0) return out;

  const total = tasks.length;

  // Planning behaviour: fraction planned in advance (vs came_up).
  const plannedCount = tasks.filter((t) => t.source === 'planned').length;
  const obsPlanned = emitProportionObservation({
    type: 'task_context',
    semanticType: 'task_context:planned_rate',
    title: 'Tasks are usually planned in advance',
    description: `Across ${total} completed tasks, ${plannedCount} (${Math.round((plannedCount / total) * 100)}%) were planned in advance rather than captured as they came up.`,
    count: plannedCount,
    total,
    baseline: RATE_BASELINE,
    traceability: {
      taskIds: [],
      taskTexts: tasks.map((t) => t.text),
      detectionSource: 'taskContext.planning',
    },
  });
  if (obsPlanned) out.push(obsPlanned);

  // Estimate attachment rate.
  const estimatedCount = tasks.filter((t) => t.estimate_mins > 0).length;
  const obsEstimated = emitProportionObservation({
    type: 'task_context',
    semanticType: 'task_context:estimated_rate',
    title: 'Duration estimates are usually attached',
    description: `Across ${total} completed tasks, ${estimatedCount} (${Math.round((estimatedCount / total) * 100)}%) included a duration estimate.`,
    count: estimatedCount,
    total,
    baseline: RATE_BASELINE,
    traceability: {
      taskIds: [],
      taskTexts: tasks.map((t) => t.text),
      detectionSource: 'taskContext.estimated',
    },
  });
  if (obsEstimated) out.push(obsEstimated);

  // Location attachment rate.
  const locatedCount = tasks.filter((t) => t.location_text).length;
  const obsLocated = emitProportionObservation({
    type: 'task_context',
    semanticType: 'task_context:located_rate',
    title: 'Tasks often include a location',
    description: `Across ${total} completed tasks, ${locatedCount} (${Math.round((locatedCount / total) * 100)}%) included a location for travel awareness.`,
    count: locatedCount,
    total,
    baseline: RATE_BASELINE,
    traceability: {
      taskIds: [],
      taskTexts: tasks.map((t) => t.text),
      detectionSource: 'taskContext.located',
    },
  });
  if (obsLocated) out.push(obsLocated);

  // Job attachment rate.
  const jobCount = tasks.filter((t) => t.job_id).length;
  const obsJob = emitProportionObservation({
    type: 'task_context',
    semanticType: 'task_context:job_rate',
    title: 'Tasks are often linked to a job',
    description: `Across ${total} completed tasks, ${jobCount} (${Math.round((jobCount / total) * 100)}%) were linked to a recurring job.`,
    count: jobCount,
    total,
    baseline: RATE_BASELINE,
    traceability: {
      taskIds: [],
      taskTexts: tasks.map((t) => t.text),
      detectionSource: 'taskContext.job',
    },
  });
  if (obsJob) out.push(obsJob);

  // Info/notes attachment rate.
  const infoCount = tasks.filter((t) => t.info && t.info.trim().length > 0).length;
  const obsInfo = emitProportionObservation({
    type: 'task_context',
    semanticType: 'task_context:info_rate',
    title: 'Tasks often carry notes',
    description: `Across ${total} completed tasks, ${infoCount} (${Math.round((infoCount / total) * 100)}%) included written notes.`,
    count: infoCount,
    total,
    baseline: RATE_BASELINE,
    traceability: {
      taskIds: [],
      taskTexts: tasks.map((t) => t.text),
      detectionSource: 'taskContext.info',
    },
  });
  if (obsInfo) out.push(obsInfo);

  return out;
}

export { buildProportionEvidence };
