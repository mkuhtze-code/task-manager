/**
 * Rank observations by *decision value* for Dokkit — not just statistical interest.
 *
 * Prefer signals that change capture, capacity, or carry.
 * Quiet by default: returns at most `limit` items.
 */

import type { StructuredObservation } from '@/lib/thinking/v2/observations';
import { runObservationPipeline, type ObservationPipelineConfig } from '@/lib/thinking/v2/pipeline';
import type { CompletedTaskFacts } from '@/lib/thinking/types';

const ACTIONABLE_TYPES = new Set([
  'estimate_calibration',
  'estimate_accuracy',
  'time_of_day',
  'repeated_carryover',
  'carryover',
  'duration_cluster',
  'cluster',
  'task_context',
  'lifecycle',
  'staleness',
  'temporal_behaviour',
]);

function actionabilityBoost(obs: StructuredObservation): number {
  const t = (obs.type || '').toLowerCase();
  const sem = (obs.semanticType || '').toLowerCase();
  let boost = 0;
  if (t.includes('carry') || sem.includes('carry')) boost += 25;
  if (t.includes('estimate') || t.includes('calibration') || sem.includes('duration'))
    boost += 20;
  if (t.includes('time_of_day') || sem.includes('temporal')) boost += 10;
  if (obs.confidence === 'high') boost += 10;
  else if (obs.confidence === 'medium') boost += 5;
  if (obs.staleness === 'stale' || obs.staleness === 'expired') boost -= 20;
  return boost;
}

export function rankActionableObservations(
  observations: StructuredObservation[],
  limit = 5
): StructuredObservation[] {
  return observations
    .filter((o) => {
      const t = (o.type || '').toLowerCase();
      if (ACTIONABLE_TYPES.has(t)) return true;
      return (
        t.includes('estimate') ||
        t.includes('carry') ||
        t.includes('duration') ||
        t.includes('cluster') ||
        t.includes('lifecycle')
      );
    })
    .map((o) => ({
      obs: o,
      score: (o.rank ?? 0) + actionabilityBoost(o),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.obs);
}

export function topActionableObservations(
  tasks: CompletedTaskFacts[],
  config: ObservationPipelineConfig & { limit?: number } = {}
): StructuredObservation[] {
  const { limit = 5, ...pipelineConfig } = config;
  const all = runObservationPipeline(tasks, pipelineConfig);
  return rankActionableObservations(all, limit);
}

export function formatObservationLine(obs: StructuredObservation, maxLen = 90): string {
  const raw = (obs.title || obs.description || '').trim();
  if (raw.length <= maxLen) return raw;
  return raw.slice(0, maxLen - 1) + '…';
}
