export type {
  Polarity,
  ActKind,
  TemporalRelation,
  SemanticEvidence,
  CorrectionStep,
  SemanticAct,
  SemanticUtterance,
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
export { composeSemanticUtterance, canProposeTask } from './compose';
