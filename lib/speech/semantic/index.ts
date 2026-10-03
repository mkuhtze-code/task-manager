export type {
  Polarity,
  ActKind,
  TemporalRelation,
  SemanticEvidence,
  CorrectionStep,
  SemanticAct,
  SemanticUtterance,
  SemanticCondition,
  SemanticDependency,
  ReferenceResolution,
  SemanticActionOutcome,
} from './types';
export { makeActId } from './types';

export { detectPolarity, isActionNegated } from './polarity';
export { buildCorrectionChain, finalAfterChain, isDiscourseActually } from './correctionChain';
export {
  textLevelSafety,
  actsLevelSafety,
  mergeSafety,
  applySafetyToUtterance,
} from './safety';
export type { SafetyVerdict } from './safety';
export { composeSemanticUtterance, canProposeTask, positiveActionActs } from './compose';
export { resolveTemporalOverlaps, temporalForClause } from './temporalSpans';
export { extractSemanticCorrections, applyCorrectionsToClause } from './correctionsSemantic';
export { resolveReferencesInActs, entitiesFromActs } from './references';
export { extractCondition, extractDependency } from './conditions';
export type {
  SpeechUnderstandingContext,
  ContextEntity,
  ContextEntityKind,
  EntityLink,
} from './context';
export {
  linkEntitiesInText,
  resolveFocusReference,
  scoreEntityMatch,
  emptySpeechContext,
} from './context';
export { applyDiscourseSupersession, reclassifyPastTenseObservations } from './discourse';
