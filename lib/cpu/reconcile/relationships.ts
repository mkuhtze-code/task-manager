import type { CpuBrainContribution, CpuRelationshipCandidate } from '../types';

export function reconcileRelationships(contributions: CpuBrainContribution[]): CpuRelationshipCandidate[] {
  const seen = new Set<string>();
  const result: CpuRelationshipCandidate[] = [];

  for (const relationship of contributions.flatMap((c) => c.relationships)) {
    const key = [relationship.sourceId, relationship.targetId, relationship.relation].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(relationship);
  }

  return result;
}
