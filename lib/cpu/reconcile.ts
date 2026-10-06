/**
 * CPU reconciliation.
 *
 * Phase 1 preserves the existing interaction result as authoritative.
 * This creates the seam where independent brain contributions can later be
 * reconciled without changing callers or domain engines.
 */

import type { CpuBrainContribution, CpuDecision } from './types';
import type { InteractionResult } from '@/lib/engine/interactionTypes';

export function reconcileCpuDecision(
  interaction: InteractionResult,
  contributions: CpuBrainContribution[]
): CpuDecision {
  const observations = contributions.flatMap((c) => c.observations);
  const relationships = contributions.flatMap((c) => c.relationships);
  const evidence = contributions.flatMap((c) => c.evidence);

  return {
    outcome: interaction.outcome,
    message: interaction.message,
    action: interaction.action,
    request: interaction.request,
    confidence: interaction.confidence,
    observations,
    relationships,
    evidence,
    interaction,
  };
}
