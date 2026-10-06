/**
 * Phase 1 brain adapters.
 *
 * These intentionally do not duplicate domain reasoning. They expose the
 * result already produced by the existing Personal Operating Engine using
 * the common CPU contribution contract.
 */

import type { CpuBrain, CpuBrainContribution, CpuInput, UniversalContext } from './types';
import type { InteractionResult } from '@/lib/engine/interactionTypes';

function coreContribution(
  input: CpuInput,
  _context: UniversalContext,
  interaction: InteractionResult
): CpuBrainContribution {
  const observations = [
    {
      brain: 'thinking' as const,
      kind: 'decision' as const,
      value: `interaction_outcome=${interaction.outcome}`,
      confidence: interaction.confidence,
      evidence: interaction.facts,
    },
    {
      brain: 'authority' as const,
      kind: 'constraint' as const,
      value: interaction.authority.reason,
      confidence: interaction.confidence,
    },
    {
      brain: 'memory' as const,
      kind: 'fact' as const,
      value: `working_memory_updated=${Boolean(interaction.workingMemory)}`,
      confidence: 'high' as const,
    },
  ];

  if (interaction.request.locationText) {
    observations.push({
      brain: 'location' as const,
      kind: 'fact' as const,
      value: `location=${interaction.request.locationText}`,
      confidence: interaction.request.confidence,
    });
  }

  if (interaction.request.relatedJobText) {
    observations.push({
      brain: 'jobs' as const,
      kind: 'relationship' as const,
      value: `job_reference=${interaction.request.relatedJobText}`,
      confidence: interaction.request.confidence,
    });
  }

  if (input.input.type === 'speech_transcript') {
    observations.push({
      brain: 'speech' as const,
      kind: 'fact' as const,
      value: 'speech_transcript_received',
      confidence: input.input.confidence ?? 'medium',
    });
  }

  return {
    brain: 'thinking',
    observations,
    relationships: [],
    evidence: interaction.evidence,
  };
}

/**
 * Compatibility adapter representing the current integrated engine.
 *
 * It is deliberately named "core" rather than pretending that every domain
 * brain has already been integrated. Phase 2 will split these observations
 * into real domain adapters without changing the CPU-facing contract.
 */
export const coreBrain: CpuBrain = {
  id: 'thinking',
  contribute: coreContribution,
};
