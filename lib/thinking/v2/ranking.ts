import { StructuredObservation } from './observations';
import { ContradictionStatus, StalenessStatus } from './evidence';

function evidenceStrengthScore(sampleSize: number): number {
  if (sampleSize >= 10) return 40;
  if (sampleSize >= 7) return 30;
  if (sampleSize >= 4) return 20;
  if (sampleSize >= 2) return 10;
  return 0;
}

function effectMagnitudeScore(magnitude: number | null): number {
  if (magnitude === null) return 0;
  return Math.round(magnitude * 20);
}

function consistencyScore(consistency: number | null): number {
  if (consistency === null) return 0;
  return Math.round(consistency * 15);
}

function recencyScore(recency: number | null): number {
  if (recency === null) return 5;
  if (recency <= 1) return 10;
  if (recency <= 7) return 8;
  if (recency <= 14) return 6;
  if (recency <= 30) return 4;
  return 2;
}

function contradictionPenalty(status: ContradictionStatus): number {
  switch (status) {
    case 'full': return 15;
    case 'partial': return 8;
    case 'none': return 0;
  }
}

function stalenessPenalty(status: StalenessStatus): number {
  switch (status) {
    case 'stale': return 10;
    case 'current': return 0;
  }
}

export function rankObservation(obs: StructuredObservation): number {
  let score = 0;
  score += evidenceStrengthScore(obs.evidence.sampleSize);
  score += effectMagnitudeScore(obs.evidence.effectMagnitude);
  score += consistencyScore(obs.evidence.consistency);
  score += recencyScore(obs.recency);
  score -= contradictionPenalty(obs.contradictionStatus);
  score -= stalenessPenalty(obs.staleness);
  return score;
}

export function rankAll(observations: StructuredObservation[]): StructuredObservation[] {
  const ranked = observations.map((obs) => ({
    ...obs,
    rank: rankObservation(obs),
  }));
  ranked.sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
  return ranked;
}
