/**
 * CPU reconciliation façade.
 *
 * Phase 3 turns specialist contributions into one reconciled decision while
 * preserving the existing interaction engine as the execution authority.
 */

import type { CpuBrainContribution, CpuDecision, UniversalContext } from './types';
import type { InteractionResult } from '@/lib/engine/interactionTypes';
import { reconcile } from './reconcile/reconcile';

export function reconcileCpuDecision(
  interaction: InteractionResult,
  contributions: CpuBrainContribution[],
  context?: UniversalContext
): CpuDecision {
  const observations = contributions.flatMap((c) => c.observations);
  const relationships = contributions.flatMap((c) => c.relationships);
  const evidence = contributions.flatMap((c) => c.evidence);
  const reconciled = context ? reconcile(context, interaction, contributions) : null;

  return {
    outcome: interaction.outcome,
    message: interaction.message,
    action: interaction.action,
    request: interaction.request,
    confidence: reconciled?.confidence ?? interaction.confidence,
    observations,
    relationships: reconciled?.relationships ?? relationships,
    opportunities: reconciled?.opportunities ?? [],
    conflicts: reconciled?.conflicts ?? [],
    recommendedAction: reconciled?.recommendedAction ?? interaction.action,
    authority: reconciled?.authority ?? interaction.authority,
    explanation: reconciled?.explanation ?? interaction.explanation,
    evidence,
    interaction,
  };
}
