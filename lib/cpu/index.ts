/**
 * Dokkit CPU — single universal orchestration façade.
 *
 * Phase 3 adds synchronous reconciliation. Existing domain execution remains
 * authoritative; the CPU now combines observations, relationships,
 * opportunities, conflicts and authority into one decision.
 */

import { processInteraction } from '@/lib/engine';
import type { CpuBrain, CpuCycleResult, CpuInput } from './types';
import { assembleUniversalContext } from './context';
import { coreBrain } from './brains';
import { reconcileCpuDecision } from './reconcile';

export type * from './types';
export type * from './reconcile/types';
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
  const interaction = processInteraction(input);

  const contributions = brains.map((brain) =>
    brain.contribute(input, context, interaction)
  );

  const decision = reconcileCpuDecision(interaction, contributions, context);

  return {
    context,
    contributions,
    decision,
  };
}
