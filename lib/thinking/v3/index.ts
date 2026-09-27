// lib/thinking/v3/index.ts
//
// Public surface for Thinking Engine V3 canonical contracts.
// Phase 1: types + adapters only. No runtime path switch.

export type {
  Confidence,
  Authority,
  ModelMaturity,
  LearningPhase,
  OutcomeKind,
  DecisionKind,
  FitState,
  EvidenceKind,
  StalenessStatus,
  ContradictionStatus,
  DurationDistribution,
  ConfidenceProfile,
  TaskFact,
  ContextSnapshot,
  Evidence,
  Belief,
  Prediction,
  Outcome,
  Decision,
  DecisionTrace,
  ModelState,
} from './types';

export {
  MODEL_VERSION,
  ALGORITHM_VERSION,
  FEATURE_VERSION,
} from './types';

export {
  confidenceProfileFromV1,
  emptyContextSnapshot,
  taskFactFromCompleted,
  taskFactFromHistorical,
  predictionFromLogEntry,
  outcomeFromCompletion,
  pointDistribution,
  minimalEvidence,
  currentVersions,
} from './adapters';
