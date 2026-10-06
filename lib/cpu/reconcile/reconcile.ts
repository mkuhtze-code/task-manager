import type { UniversalContext, CpuBrainContribution } from '../types';
import type { InteractionResult } from '@/lib/engine/interactionTypes';
import { detectConflicts } from './conflicts';
import { maxConfidence } from './confidence';
import { detectOpportunities } from './opportunities';
import { rankOpportunities, selectSurfaceOpportunity } from './opportunityRanker';
import { reconcileRelationships } from './relationships';
import type { ReconciledDecision } from './types';

export function reconcile(
  context: UniversalContext,
  interaction: InteractionResult,
  contributions: CpuBrainContribution[]
): ReconciledDecision {
  const observations = contributions.flatMap((c) => c.observations);
  const relationships = reconcileRelationships(contributions);
  const conflicts = detectConflicts(contributions);
  const opportunities = detectOpportunities(context, interaction);
  const rankedOpportunities = rankOpportunities(opportunities, { context, interaction });
  const surfaceOpportunity = selectSurfaceOpportunity(rankedOpportunities, interaction);

  // Authority has already been decided by the existing engine. Phase 3 must
  // not recalculate or weaken it while the universal dispatcher is not yet in
  // place. In particular, capacity/opportunity signals never veto a user's
  // explicit commitment.
  const authority = interaction.authority;
  const recommendedAction = authority.mayAct ? interaction.action : null;

  const confidence = maxConfidence([
    interaction.confidence,
    ...observations.map((o) => o.confidence),
    ...relationships.map((r) => r.confidence),
    ...opportunities.map((o) => o.confidence),
  ]);

  const opportunityText = surfaceOpportunity?.message ?? '';
  const explanation = opportunityText
    ? [interaction.explanation, opportunityText].filter(Boolean).join(' ').trim()
    : interaction.explanation;

  return {
    primaryIntent: interaction.request,
    relevantEntities: relationships.flatMap((r) => [r.sourceId, r.targetId]),
    relationships,
    opportunities,
    rankedOpportunities,
    surfaceOpportunity,
    conflicts,
    recommendedAction,
    confidence,
    authority,
    explanation,
    interaction,
    observations,
    evidence: interaction.evidence,
  };
}
