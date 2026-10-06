/**
 * Dokkit CPU — single universal orchestration façade.
 *
 * Phase 3 adds synchronous reconciliation. Existing domain execution remains
 * authoritative; the CPU now combines observations, relationships,
 * opportunities, conflicts and authority into one decision.
 */

import { processInteractionCore } from '@/lib/engine/interaction';
import type { CpuBrain, CpuCycleResult, CpuInput } from './types';
import { assembleUniversalContext } from './context';
import { DEFAULT_BRAINS } from './brains';
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

export function processCpuInteraction(
  input: CpuInput,
  brains: CpuBrain[] = DEFAULT_BRAINS
): CpuCycleResult {
  const context = assembleUniversalContext(input);
  const interaction = processInteractionCore(input);

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

export type { UniversalAction, ActionExecutionResult } from './actions/types';
export { universalActionFromEngine } from './actions/types';
export { dispatchUniversalAction } from './actions/dispatcher';
export type { UniversalActionExecutors } from './actions/dispatcher';

export { DEFAULT_BRAINS } from './brains';


import type { UniversalActionExecutors } from './actions/dispatcher';
import { dispatchUniversalAction } from './actions/dispatcher';
import { universalActionFromEngine } from './actions/types';
import type { ActionExecutionResult } from './actions/types';

export type CpuExecutionResult = {
  executed: boolean;
  execution: ActionExecutionResult | null;
};

/**
 * Phase 7 execution boundary.
 *
 * The CPU decides first. Execution happens only for an ACT decision with an
 * action and registered domain executor. The executor is supplied by the
 * surface/application layer so the CPU remains independent of Supabase/UI.
 */
export async function executeCpuDecision(
  result: CpuCycleResult,
  executors: UniversalActionExecutors = {},
): Promise<CpuExecutionResult> {
  const decision = result.decision;
  if (decision.outcome !== 'ACT' || !decision.authority.mayAct || !decision.recommendedAction) {
    return { executed:false, execution:null };
  }

  const action = universalActionFromEngine(decision.recommendedAction);
  const execution = await dispatchUniversalAction(action, executors);
  return {
    executed: execution.status === 'executed',
    execution,
  };
}
