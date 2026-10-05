/**
 * Dokkit Personal Operating Engine — public surface.
 * Thin orchestration over existing intelligence; no LLM.
 */

export type {
  AutonomyLevel,
  CommitmentClass,
  Confidence,
  Constraint,
  ConstraintAxis,
  CurrentFocus,
  EngineAction,
  EngineCycleResult,
  EngineRequest,
  LearningEvidence,
  MemoryItem,
  MemoryItemType,
  PlanProposal,
  PlanStep,
  ReasoningContext,
  RequestAction,
  WorkingMemorySnapshot,
  AuthorityDecision,
} from './types';

export {
  emptyWorkingMemory,
  loadWorkingMemory,
  saveWorkingMemory,
  makeMemoryItem,
  remember,
  setFocus,
  setActiveRequest,
  setTopic,
  touchDecay,
  allReferents,
} from './workingMemory';

export {
  containsReference,
  extractReferencePhrase,
  resolveReference,
} from './references';
export type { ReferenceResolution } from './references';

export {
  emptyRequest,
  interpretRequestUtterance,
  applyUtteranceToRequest,
  requestTaskText,
} from './request';

export {
  assembleContext,
  resolveJobName,
  resolveLocationAgainstJobs,
} from './contextAssembly';
export type { ContextInputs } from './contextAssembly';

export { classifyCommitment, decideAuthority } from './authority';
export { explainDecision } from './explain';

export { runEngineCycle, runConversation } from './orchestrate';
export type { CycleInput } from './orchestrate';

export {
  loadWorkingMemoryLocal,
  saveWorkingMemoryLocal,
  loadActiveRequestLocal,
  saveActiveRequestLocal,
  appendEvidenceLocal,
  loadEvidenceLocal,
  pushEngineStateRemote,
  hydrateEngineStateRemote,
  bindRequestToTask,
  taskIdFromRequest,
} from './persist';
export type { EngineSupabase } from './persist';
