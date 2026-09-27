// lib/thinking/v3/index.ts
//
// Public surface for Thinking Engine V3 canonical contracts.
// Phase 1–5 + context-conditional duration + production suggest bridge.

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
  durationBeliefFromSamples,
} from './adapters';

export type { ThinkingEventKind, ThinkingEvent } from './events';
export { makeEventId, makeDecisionId, buildThinkingEvent } from './events';

export {
  mean,
  median,
  trimmedMean,
  weightedAverage,
  recencyWeights,
  recencyWeightedMean,
  recencyWeightedMedian,
  standardDeviation,
  mad,
  madScaled,
  percentile,
  iqr,
  weightedPercentile,
  shrinkTowardPrior,
  blendEstimates,
  robustInterval,
  durationFromSamples,
  consistencyScore,
  effectMagnitudeFromRatio,
} from './stats';
export type { RobustSpread } from './stats';

export type { HistorySample, ClusterModel } from './clusters';
export {
  CLUSTER_MATCH_THRESHOLD,
  CLUSTER_VERSION,
  tokenize,
  tokenSet,
  jaccard,
  clusterIdFromTokens,
  buildClusterModels,
  matchCluster,
  userDurationFromClusters,
  personalMedianMins,
} from './clusters';

export type {
  PersonalModelPriors,
  ClosedOutcomeSample,
  PersonalModel,
  HierarchicalDuration,
  SameDayLookup,
} from './model';
export {
  SYSTEM_DEFAULT_MINS,
  DEFAULT_PRIOR_STRENGTH,
  buildPersonalModel,
  lookupHierarchicalDuration,
  lookupSameDayRate,
  learningPhaseFromClosedCount,
  maturityFromEvidence,
  historySampleFromRow,
  modelVersions,
} from './model';

export type {
  DayPeriod,
  DurationContext,
  ContextDurationLevel,
  ContextualDuration,
} from './contextDuration';
export {
  MIN_CONTEXT_SAMPLES,
  placeKey,
  classifyDayPeriod,
  filterSamplesForContext,
  lookupContextualDuration,
} from './contextDuration';

export type { V3EstimateSuggestion, SuggestHistoryRow, SuggestEstimateOpts } from './suggest';
export {
  MIN_SAMPLES_FOR_SUGGESTION as V3_MIN_SAMPLES_FOR_SUGGESTION,
  suggestEstimateV3,
  personalModelFromHistory,
} from './suggest';
