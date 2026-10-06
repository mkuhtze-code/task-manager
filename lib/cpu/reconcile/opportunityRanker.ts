import type { Confidence } from '@/lib/engine';
import type { InteractionResult } from '@/lib/engine/interactionTypes';
import type { UniversalContext } from '../types';
import type { ReconciledOpportunity } from './types';

export type OpportunityDisposition = 'surface' | 'suggest' | 'retain' | 'ignore';

export type OpportunityRankingContext = {
  context: UniversalContext;
  interaction: InteractionResult;
};

export type RankedOpportunity = ReconciledOpportunity & {
  score: number;
  disposition: OpportunityDisposition;
  reasons: string[];
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
  if (score >= 45) return 'retain';
  return 'ignore';
}

function requestIsFlexible(interaction: InteractionResult): boolean {
  const text = interaction.request.objectText ?? interaction.message ?? '';
  return /\b(sometime|some time|when you can|if you can|while you.?re there|on the way|on my way|later|this week)\b/i.test(text);
}

function practicalValue(
  opportunity: ReconciledOpportunity,
  ranking: OpportunityRankingContext,
): { points: number; reasons: string[] } {
  const reasons: string[] = [];
  let points = 0;
  const { context, interaction } = ranking;

  if (opportunity.kind === 'spatial' || opportunity.kind === 'route') {
    if (interaction.request.locationText) {
      points += 8;
      reasons.push('same-place context');
    }
    if (requestIsFlexible(interaction)) {
      points += 10;
      reasons.push('flexible timing makes combining practical');
    }
  }

  if (opportunity.kind === 'job') {
    points += 6;
    reasons.push('direct job relevance');
    if (interaction.request.locationText) {
      points += 5;
      reasons.push('requested location is explicit');
    }
  }

  if (opportunity.kind === 'temporal' || opportunity.kind === 'meeting') {
    points += 8;
    reasons.push('timing is directly relevant');
  }

  if (opportunity.kind === 'travel' && context.movement.travel) {
    points += 7;
    reasons.push('active trip context');
  }

  if (opportunity.kind === 'memory') {
    points -= 8;
    reasons.push('memory-only connection is weaker evidence');
  }

  if (context.constraints.remainingMinsToday !== null && context.constraints.remainingMinsToday <= 15) {
    points -= 4;
    reasons.push('today is capacity-constrained');
  }

  return { points, reasons };
}

/**
 * Phase 9 opportunity ranking.
 *
 * Detection answers "is there a connection?".
 * Ranking answers "is it useful enough to bother the user with?".
 *
 * Ranking is deliberately contextual, deterministic and non-mutating.
 * It never changes authority and never executes or reschedules anything.
 */
export function rankOpportunities(
  opportunities: ReconciledOpportunity[],
  ranking: OpportunityRankingContext,
): RankedOpportunity[] {
  return opportunities
    .map((opportunity) => {
      const value = practicalValue(opportunity, ranking);
      const score = Math.max(
        0,
        Math.min(
          100,
          confidenceWeight[opportunity.confidence] +
            kindWeight[opportunity.kind] +
            value.points,
        ),
      );

      return {
        ...opportunity,
        score,
        disposition: dispositionFor(score),
        reasons: value.reasons,
      };
    })
    .filter((opportunity) => opportunity.disposition !== 'ignore')
    .sort((a, b) => b.score - a.score);
}

export function selectSurfaceOpportunity(
  opportunities: RankedOpportunity[],
  interaction: InteractionResult,
): RankedOpportunity | null {
  if (interaction.authority.commitmentClass === 'HARD_COMMITMENT') {
    return null;
  }

  return opportunities.find((opportunity) => opportunity.disposition === 'surface') ?? null;
}
