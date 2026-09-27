// lib/thinking/v3/evidenceQuality.ts
//
// Phase 5.5 — evidence quality is not sample count.

import type { Confidence, ConfidenceProfile } from './types';

export type EvidenceQuality = {
  volume: number;
  independentCount: number;
  recency: number | null;
  consistency: number | null;
  diversity: number | null;
  contextCoverage: number | null;
  outcomeQuality: number | null;
  strength: number;
  confidence: Confidence;
};

export type EvidenceQualityInput = {
  volume: number;
  independentCount?: number;
  recency?: number | null;
  consistency?: number | null;
  diversity?: number | null;
  contextCoverage?: number | null;
  outcomeQuality?: number | null;
};

export function independentFromEpisodes(
  episodeCount: number,
  distinctTaskDays: number
): number {
  if (episodeCount <= 0) return 0;
  return Math.max(1, Math.min(episodeCount, distinctTaskDays));
}

export function assessEvidenceQuality(
  input: EvidenceQualityInput
): EvidenceQuality {
  const volume = Math.max(0, input.volume);
  const independent = Math.max(0, input.independentCount ?? volume);
  const recency = input.recency ?? null;
  const consistency = input.consistency ?? null;
  const diversity = input.diversity ?? null;
  const contextCoverage = input.contextCoverage ?? null;
  const outcomeQuality = input.outcomeQuality ?? null;

  const volumeScore = Math.min(1, independent / 7);
  const recencyScore = recency ?? 0.5;
  const consistencyScore = consistency ?? 0.5;
  const diversityScore = diversity ?? 0.4;
  const contextScore = contextCoverage ?? 0.4;
  const outcomeScore = outcomeQuality ?? 0.7;

  const strength = Math.max(
    0,
    Math.min(
      1,
      volumeScore * 0.35 +
        recencyScore * 0.15 +
        consistencyScore * 0.2 +
        diversityScore * 0.1 +
        contextScore * 0.1 +
        outcomeScore * 0.1
    )
  );

  let confidence: Confidence = 'low';
  if (strength >= 0.7 && independent >= 5) confidence = 'high';
  else if (strength >= 0.4 && independent >= 2) confidence = 'medium';

  return {
    volume,
    independentCount: independent,
    recency,
    consistency,
    diversity,
    contextCoverage,
    outcomeQuality,
    strength,
    confidence,
  };
}

export function propagateConfidence(
  identityConfidence: Confidence,
  durationConfidence: Confidence
): Confidence {
  const rank = { low: 0, medium: 1, high: 2 };
  const r = Math.min(rank[identityConfidence], rank[durationConfidence]);
  return (['low', 'medium', 'high'] as const)[r];
}

export function confidenceProfileFromQuality(
  quality: EvidenceQuality,
  opts?: { specificity?: number | null }
): ConfidenceProfile {
  return {
    overall: quality.confidence,
    sampleStrength:
      quality.independentCount >= 7
        ? 'high'
        : quality.independentCount >= 3
          ? 'medium'
          : 'low',
    effectStrength: quality.confidence,
    consistencyStrength:
      quality.consistency == null
        ? 'low'
        : quality.consistency >= 0.75
          ? 'high'
          : quality.consistency >= 0.5
            ? 'medium'
            : 'low',
    recencyWeight: quality.recency,
    specificity: opts?.specificity ?? quality.contextCoverage,
    contradiction: 'none',
    staleness: 'current',
  };
}
