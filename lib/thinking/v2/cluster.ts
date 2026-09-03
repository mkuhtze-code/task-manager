import { CompletedTaskFacts } from '../types';
import { buildClusterGroups, ClusterGroup } from './clusterGroups';
import {
  buildEvidence,
  deriveConfidenceDimensions,
  deriveConfidence,
  median,
  standardDeviation,
} from './evidence';
import { observationIdentityKey } from './identity';
import { buildStructuredObservation, StructuredObservation } from './observations';
import { buildProportionEvidence } from './proportion';

/**
 * Cluster detector (V2).
 *
 * Produces one observation per recurring cluster when the evidence supports
 * it. Two sub-families:
 *
 *   1. cluster:duration — "This kind of task usually takes about N minutes".
 *      Requires a real denominator (completed tasks with a known duration) and
 *      a baseline (median of the whole corpus) so the claim is anchored to
 *      something, plus variance/stability.
 *
 *   2. cluster:place — "Tasks of this kind usually happen at location X".
 *      Requires a minimum sample, a dominant location above a baseline share,
 *      and collapses to the majority location. Wording is association-only.
 *
 * Compared to the weak V1 `clusterBehaviour`/place association modules, this
 * V2 version computes effect magnitude, consistency/variance, missing data,
 * and a baseline, and refuses to emit when the denominator or baseline is
 * invalid.
 */

const MIN_CLUSTER_SAMPLE = 3;
const MIN_PLACE_SAMPLE = 4;
const PLACE_BASELINE = 0.5;

function durationOf(t: CompletedTaskFacts): number | null {
  return t.actual_mins ?? null;
}

function observeClusterDuration(group: ClusterGroup, corpusBaseline: number | null): StructuredObservation | null {
  const tasks = group.tasks.filter((t) => durationOf(t) !== null);
  const sampleSize = tasks.length;
  if (sampleSize < MIN_CLUSTER_SAMPLE) return null;

  const values = tasks.map((t) => durationOf(t) as number);
  const med = median(values);
  if (med === null) return null;

  // Effect: how far this cluster's median deviates from the corpus baseline,
  // normalised to [0,1] relative to a meaningful margin (half the baseline).
  let effectMagnitude: number | null = null;
  if (corpusBaseline !== null && corpusBaseline > 0) {
    const deviation = Math.abs(med - corpusBaseline);
    const margin = Math.max(corpusBaseline * 0.5, 5);
    effectMagnitude = Math.min(deviation / margin, 1);
  }

  const variance = standardDeviation(values);
  const consistency = variance !== null && med !== null && med !== 0
    ? Math.max(0, 1 - variance / med)
    : null;

  if (effectMagnitude === null || effectMagnitude < 0.15) return null;

  const evidence = buildEvidence({
    sampleSize,
    values,
    effectMagnitude,
    specificity: null,
    measurements: [
      { cluster: group.label, medianMins: med, sampleSize, variance, consistency },
    ],
    evidenceKind: 'observation',
  });

  const confidenceDimensions = deriveConfidenceDimensions(evidence);
  const confidence = deriveConfidence(confidenceDimensions);

  const id = observationIdentityKey({
    type: 'cluster',
    clusterLabel: group.label,
    subType: 'duration',
  });

  return buildStructuredObservation({
    id,
    type: 'cluster',
    title: `${group.label} tasks usually take about ${Math.round(med)} minutes`,
    description:
      `Based on ${sampleSize} completed ${group.label} tasks, they typically take around ${Math.round(med)} minutes.` +
      (corpusBaseline !== null ? ` Across all your tasks the median is about ${Math.round(corpusBaseline)} minutes.` : ''),
    evidence,
    confidenceDimensions,
    confidence,
    affectedContext: { clusterLabel: group.label },
    traceability: {
      taskIds: [],
      taskTexts: tasks.map((t) => t.text),
      detectionSource: 'cluster.duration',
    },
    semanticType: 'cluster:duration',
  });
}

function dominantLocation(group: ClusterGroup): { text: string; count: number } | null {
  const located = group.tasks.filter((t) => t.location_text);
  if (located.length < MIN_PLACE_SAMPLE) return null;

  const byPlace = new Map<string, number>();
  for (const t of located) {
    const key = (t.location_text || '').trim().toLowerCase();
    if (!key) continue;
    byPlace.set(key, (byPlace.get(key) ?? 0) + 1);
  }
  if (byPlace.size === 0) return null;

  let best: string | null = null;
  let bestCount = -1;
  for (const [place, count] of byPlace) {
    if (count > bestCount) {
      best = place;
      bestCount = count;
    }
  }
  if (best === null) return null;
  return { text: best, count: bestCount };
}

function observeClusterPlace(group: ClusterGroup): StructuredObservation | null {
  const total = group.tasks.length;
  if (total < MIN_PLACE_SAMPLE) return null;

  const dom = dominantLocation(group);
  if (!dom) return null;

  // Baseline is PLACE_BASELINE (a place is "dominant" only when clearly a
  // majority of located tasks point to it). Missing location data is tracked.
  const locatedCount = group.tasks.filter((t) => t.location_text).length;
  const missingLocation = total - locatedCount;

  const result = buildProportionEvidence({
    count: dom.count,
    total: locatedCount,
    baseline: PLACE_BASELINE,
    missingDataCount: missingLocation,
    evidenceKind: 'association',
  });

  if (result.evidence.insufficient || result.effect === null || result.effect < 0.2) return null;

  const id = observationIdentityKey({
    type: 'cluster',
    clusterLabel: group.label,
    location: dom.text,
    subType: 'place',
  });

  return buildStructuredObservation({
    id,
    type: 'cluster',
    title: `${group.label} tasks usually happen at ${group.tasks.find((t) => t.location_text)!.location_text}`,
    description:
      `Of ${locatedCount} ${group.label} tasks with a location, ${dom.count} (${Math.round((dom.count / locatedCount) * 100)}%) were at ${group.tasks.find((t) => t.location_text)!.location_text}.`,
    evidence: result.evidence,
    confidenceDimensions: result.confidenceDimensions,
    confidence: result.confidence,
    affectedContext: { clusterLabel: group.label, location: dom.text },
    traceability: {
      taskIds: [],
      taskTexts: group.tasks.map((t) => t.text),
      detectionSource: 'cluster.place',
    },
    semanticType: 'cluster:place',
  });
}

export function observeV2Clusters(
  tasks: CompletedTaskFacts[],
): StructuredObservation[] {
  const out: StructuredObservation[] = [];
  if (tasks.length === 0) return out;

  const groups = buildClusterGroups(tasks);

  // Corpus-wide median duration for the duration baseline.
  const durations = tasks.map((t) => t.actual_mins).filter((d): d is number => d !== null);
  const corpusBaseline = median(durations);

  for (const group of groups) {
    const durationObs = observeClusterDuration(group, corpusBaseline);
    if (durationObs) out.push(durationObs);

    const placeObs = observeClusterPlace(group);
    if (placeObs) out.push(placeObs);
  }

  return out;
}
