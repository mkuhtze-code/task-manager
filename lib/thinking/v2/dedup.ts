import { StructuredObservation } from './observations';

export function deduplicateObservations(observations: StructuredObservation[]): StructuredObservation[] {
  const byType = new Map<string, StructuredObservation[]>();

  for (const obs of observations) {
    const existing = byType.get(obs.semanticType);
    if (existing) {
      existing.push(obs);
    } else {
      byType.set(obs.semanticType, [obs]);
    }
  }

  const result: StructuredObservation[] = [];

  for (const group of byType.values()) {
    const byId = new Map<string, StructuredObservation>();
    for (const obs of group) {
      const existing = byId.get(obs.id);
      if (!existing) {
        byId.set(obs.id, obs);
      } else {
        const existingScore = evidenceScore(existing.evidence);
        const newScore = evidenceScore(obs.evidence);
        if (newScore > existingScore) {
          byId.set(obs.id, obs);
        }
      }
    }
    result.push(...byId.values());
  }

  return result;
}

function evidenceScore(e: { sampleSize: number; effectMagnitude: number | null; consistency: number | null }): number {
  let score = e.sampleSize * 10;
  if (e.effectMagnitude !== null) score += e.effectMagnitude * 30;
  if (e.consistency !== null) score += e.consistency * 20;
  return score;
}
