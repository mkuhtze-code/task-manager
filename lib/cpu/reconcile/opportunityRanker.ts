import type { Confidence } from '@/lib/engine';
import type { ReconciledOpportunity } from './types';

export type OpportunityDisposition = 'surface' | 'suggest' | 'retain' | 'ignore';

export type RankedOpportunity = ReconciledOpportunity & {
  score: number;
  disposition: OpportunityDisposition;
};

const confidenceWeight: Record<Confidence, number> = {
  low: 15,
  medium: 45,
  high: 75,
};

const kindWeight: Record<ReconciledOpportunity['kind'], number> = {
  spatial: 15,
  temporal: 18,
  job: 20,
  travel: 14,
  meeting: 18,
  dependency: 20,
  information: 10,
  person: 12,
  route: 18,
  memory: 8,
};

function dispositionFor(score: number): OpportunityDisposition {
  if (score >= 85) return 'surface';
  if (score >= 65) return 'suggest';
  if (score >= 40) return 'retain';
  return 'ignore';
}

/**
 * Phase 9 opportunity ranking.
 *
 * Detection answers "is there a connection?".
 * Ranking answers "is it useful enough to bother the user with?".
 *
 * This deliberately has no mutation or authority semantics.
 */
export function rankOpportunities(
  opportunities: ReconciledOpportunity[],
): RankedOpportunity[] {
  return opportunities
    .map((opportunity) => {
      const score = Math.min(
        100,
        confidenceWeight[opportunity.confidence] + kindWeight[opportunity.kind],
      );

      return {
        ...opportunity,
        score,
        disposition: dispositionFor(score),
      };
    })
    .filter((opportunity) => opportunity.disposition !== 'ignore')
    .sort((a, b) => b.score - a.score);
}

export function selectSurfaceOpportunity(
  opportunities: RankedOpportunity[],
): RankedOpportunity | null {
  return opportunities.find((opportunity) => opportunity.disposition === 'surface') ?? null;
}
