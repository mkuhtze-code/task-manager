// lib/thinking/v3/index.ts
// Public surface — Phase 1–5.5 foundation hardening.

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
  GENERIC_TOKENS,
  JOIN_THRESHOLD,
  tokenize,
  tokenSet,
  tokenWeight,
  discriminativeTokens,
  jaccard,
  weightedJaccard,
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

export type { UserCalendarContext } from './temporal';
export {
  localDateString,
  localHour,
  localDayOfWeek,
  sameLocalCalendarDay,
  completionAgeDays,
  taskAgeDaysAt,
  periodFromLocalHour,
  buildUserCalendarContext,
} from './temporal';

export type {
  WorkEpisode,
  EpisodeOutcome,
  DurationEvidenceKind,
  EpisodeBuildInput,
} from './episodes';
export {
  buildWorkEpisode,
  trainMinutesFromEpisode,
  safeActualForCalibration,
} from './episodes';

export type {
  TaskIdentityRef,
  TaskFeatures,
  SequenceEdge,
} from './identity';
export {
  sameTaskIdentity,
  distinctDespiteSameText,
  sequenceEdge,
  taskKeyedMap,
  assertTaskId,
} from './identity';

export type { EvidenceQuality, EvidenceQualityInput } from './evidenceQuality';
export {
  independentFromEpisodes,
  assessEvidenceQuality,
  propagateConfidence,
  confidenceProfileFromQuality,
} from './evidenceQuality';

export type { DurationMode, MultimodalDuration } from './durationModes';
export {
  detectDurationModes,
  multimodalDurationFromSamples,
} from './durationModes';

export type { CalibrationPair, CalibrationReport } from './calibrationMetrics';
export { logRatio, calibrateFromPairs } from './calibrationMetrics';
