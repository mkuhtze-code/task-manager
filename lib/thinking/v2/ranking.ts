import { StructuredObservation } from './observations';
import { ContradictionStatus, StalenessStatus } from './evidence';

/**
 * Deterministic, explainable, bounded ranking of valid observations.
 *
 * Ranking answers: "Which valid observations are most useful/relevant to
 * surface now?" This is deliberately SEPARATE from confidence, which answers
 * "How strong is the evidence?". The two must not be conflated.
 *
 * The formula is deterministic (no random/render-time values), bounded (each
 * component has fixed min/max), and does not depend on array position.
 *
 * Component weights (max points shown):
 *   sample strength       0–30
 *   effect magnitude      0–25
 *   consistency           0–20
 *   variance/stability    0–10
 *   specificity           0–10
 *   recency               0–10
 *   minus contradiction   −0..15
 *   minus staleness       −0..8
 *   minus missing data    −0..5
 *
 * Max achievable ≈ 105; realistically observations land well below that.
 */
export const RANKING_WEIGHTS = {
  sampleMax: 30,
  effectMax: 25,
  consistencyMax: 20,
  varianceMax: 10,
  specificityMax: 10,
  recencyMax: 10,
  contradictionPenaltyMax: 15,
  stalenessPenaltyMax: 8,
  missingDataPenaltyMax: 5,
} as const;

function sampleScore(n: number): number {
  if (n >= 10) return RANKING_WEIGHTS.sampleMax;
  if (n >= 7) return 25;
  if (n >= 4) return 16;
  if (n >= 2) return 8;
  return 0;
}

function effectScore(magnitude: number | null): number {
  if (magnitude === null) return 0;
  // Clamp to [0,1] then scale to max. A meaningful effect (>=0.5) earns most
  // of the budget; tiny effects contribute little.
  const clamped = Math.min(Math.max(magnitude, 0), 1);
  return Math.round(clamped * RANKING_WEIGHTS.effectMax);
}

function consistencyScore(consistency: number | null): number {
  if (consistency === null) return 0;
  return Math.round(Math.min(Math.max(consistency, 0), 1) * RANKING_WEIGHTS.consistencyMax);
}

function varianceScore(variance: number | null): number {
  if (variance === null) return RANKING_WEIGHTS.varianceMax / 2; // unknown stability = neutral
  // Lower variance (relative to the mean) means more stable → higher score.
  // We bound it so that variance == sampleSize (highly spread) gives ~0.
  const normalized = Math.min(variance, 10) / 10;
  return Math.round((1 - normalized) * RANKING_WEIGHTS.varianceMax);
}

function specificityScore(specificity: number | null): number {
  if (specificity === null) return 0;
  return Math.round(Math.min(Math.max(specificity, 0), 1) * RANKING_WEIGHTS.specificityMax);
}

function recencyScore(recency: number | null): number {
  if (recency === null) return 5; // unknown recency = neutral
  if (recency <= 1) return RANKING_WEIGHTS.recencyMax;
  if (recency <= 7) return 8;
  if (recency <= 14) return 6;
  if (recency <= 30) return 4;
  return 2;
}

function contradictionPenalty(status: ContradictionStatus): number {
  switch (status) {
    case 'full': return RANKING_WEIGHTS.contradictionPenaltyMax;
    case 'partial': return 8;
    case 'none': return 0;
  }
}

function stalenessPenalty(status: StalenessStatus): number {
  switch (status) {
    case 'stale': return RANKING_WEIGHTS.stalenessPenaltyMax;
    case 'current': return 0;
  }
}

function missingDataPenalty(missingDataCount: number): number {
  if (missingDataCount <= 0) return 0;
  return Math.min(missingDataCount, 5);
}

export function rankObservation(obs: StructuredObservation): number {
  let score = 0;
  score += sampleScore(obs.evidence.sampleSize);
  score += effectScore(obs.evidence.effectMagnitude);
  score += consistencyScore(obs.evidence.consistency);
  score += varianceScore(obs.evidence.variance);
  score += specificityScore(obs.evidence.specificity);
  score += recencyScore(obs.recency);
  score -= contradictionPenalty(obs.contradictionStatus);
  score -= stalenessPenalty(obs.staleness);
  score -= missingDataPenalty(obs.evidence.missingDataCount);
  return score;
}

export function rankAll(observations: StructuredObservation[]): StructuredObservation[] {
  const ranked = observations.map((obs) => ({
    ...obs,
    rank: rankObservation(obs),
  }));
  // Deterministic tie-break: higher rank first, then lexicographic id.
  ranked.sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
  return ranked;
}
