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
import { loadBeliefGraphLocal, saveBeliefGraphLocal } from './beliefPersist';
import { updateBeliefGraph } from './beliefs';

export type * from './types';
export type { Belief, BeliefGraph, EvidenceRef, EvidenceStrength } from './beliefs';
export type * from './reconcile/types';
export type { RankedOpportunity, OpportunityDisposition } from './reconcile/opportunityRanker';
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
  // The interaction must be evaluated first so the universal context contains
  // the canonical request + authority for this cycle. This closes the former
  // context-before-understanding gap without changing execution semantics.
  const interaction = processInteractionCore(input);
  const previousBeliefs = input.dryRun ? undefined : loadBeliefGraphLocal(input.userId);
  const beliefs = updateBeliefGraph(
    previousBeliefs ?? { version: 1, updatedAt: new Date(0).toISOString(), beliefs: [] },
    input.userId,
    interaction.request,
    interaction.evidence
  );
  if (!input.dryRun) saveBeliefGraphLocal(beliefs, input.userId);
  const context = assembleUniversalContext(input, interaction, beliefs);

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
