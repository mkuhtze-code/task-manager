import type { UniversalContext, CpuBrainContribution } from '../types';
import type { InteractionResult } from '@/lib/engine/interactionTypes';
import { decideAuthority } from '@/lib/engine/authority';
import { detectConflicts } from './conflicts';
import { maxConfidence } from './confidence';
import { detectOpportunities } from './opportunities';
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
  const authority = decideAuthority(interaction.request);

  // The existing engine's action remains authoritative until the universal
  // dispatcher exists. Opportunities can explain or suggest; they cannot veto
  // an explicit user commitment.
  const recommendedAction = authority.mayAct ? interaction.action : null;
  const confidence = maxConfidence([
    interaction.confidence,
    ...observations.map((o) => o.confidence),
    ...relationships.map((r) => r.confidence),
    ...opportunities.map((o) => o.confidence),
  ]);

  const explanation = opportunities.length > 0
    ? `${interaction.explanation} ${opportunities.map((o) => o.message).join(' ')}`.trim()
    : interaction.explanation;

  return {
    primaryIntent: interaction.request,
    relevantEntities: relationships.flatMap((r) => [r.sourceId, r.targetId]),
    relationships,
    opportunities,
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
