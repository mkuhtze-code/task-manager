/**
 * Dokkit CPU — single universal orchestration façade.
 *
 * This is an additive compatibility layer in Phase 1. Existing clients may
 * continue using processInteraction unchanged. New clients should use the CPU
 * entry point so future cross-surface integration has one home.
 */

import { processInteraction } from '@/lib/engine';
import type { CpuBrain, CpuCycleResult, CpuInput } from './types';
import { assembleUniversalContext } from './context';
import { coreBrain } from './brains';
import { reconcileCpuDecision } from './reconcile';

export type * from './types';
export {
  selectTodayContext,
  selectJobsContext,
  selectMeetingsContext,
  selectCalendarContext,
  selectTravelContext,
  selectWorkingMemory,
  selectCurrentFocus,
  selectEntities,
} from './context/selectors';

const DEFAULT_BRAINS: CpuBrain[] = [coreBrain];

export function processCpuInteraction(
  input: CpuInput,
  brains: CpuBrain[] = DEFAULT_BRAINS
): CpuCycleResult {
  const context = assembleUniversalContext(input);

  // Existing engine remains the behavioural authority. This is intentionally
  // the only execution path in Phase 1.
  const interaction = processInteraction(input);

  const contributions = brains.map((brain) =>
    brain.contribute(input, context, interaction)
  );

  const decision = reconcileCpuDecision(interaction, contributions);

  return {
    context,
    contributions,
    decision,
  };
}
