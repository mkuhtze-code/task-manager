// lib/thinking/index.ts
//
// Public API for the thinking engine. Re-exports the pieces that
// the rest of the app needs, keeping the internal module structure
// private.

// Foundation
export type {
  Confidence,
  CompletedTaskFacts,
  EstimateAccuracyObservation,
  DurationMemoryObservation,
  LifecycleObservation,
  DecompositionObservation,
  StalenessObservation,
  PlanningObservation,
  ClusterBehaviourObservation,
  Observation,
  EffectiveEstimateDecision,
  PredictionLogEntry,
  ClusterStats,
  ActivityProfile,
  UserPatterns,
  DecisionAuthority,
  JobContextDecision,
  LocationMemoryDecision,
  Surface,
  SurfaceEvent,
  PersonalGravityDecision,
  CaptureContextDecision,
} from './types';

export {
  classifyConfidence,
  BLEND_WEIGHTS,
  CONFIDENCE_THRESHOLDS,
  MIN_SAMPLES_FOR_BLENDING,
} from './confidence';

export {
  averageDuration,
  decayWeightedAverage,
  detectTrend,
  summarizeCluster,
} from './memory';

export {
  observeEstimateAccuracy,
  classifyAccuracy,
  summarizeAccuracy,
} from './observations/estimateAccuracy';

export {
  observeDurationMemory,
  observeAllClusters,
} from './observations/durationMemory';

export {
  observeLifecycle,
  observeClusterLifecycle,
} from './observations/taskLifecycle';

export {
  observeDecomposition,
  observeClusterDecomposition,
} from './observations/decomposition';

export {
  observeStaleness,
  observeClusterStaleness,
} from './observations/staleness';

export {
  observePlanning,
  observeClusterPlanning,
} from './observations/planningBehaviour';

export {
  observeClusterBehaviour,
} from './observations/clusterBehaviour';

export {
  buildActivityProfile,
  buildAllActivityProfiles,
} from './compose/activityProfile';

export {
  buildUserPatterns,
} from './compose/userPatterns';

export {
  computeEffectiveEstimate,
  effectiveEstimate,
  hasMeaningfulDivergence,
} from './decisions/effectiveEstimate';

export {
  decideJobContext,
  MIN_SPATIAL_COUNT,
  MIN_TEMPORAL_COUNT,
  MIN_SEQUENCE_COUNT,
  MIN_AGREEING_DIMENSIONS,
} from './decisions/jobContext';

export {
  decideLocationMemory,
  MIN_OCCURRENCES_FOR_LOCATION,
  MIN_RATIO_FOR_LOCATION,
} from './decisions/locationMemory';

export {
  decidePersonalGravity,
  MIN_TOTAL_EVENTS,
  MIN_DAYS_OBSERVED,
  ACTIVE_WEIGHT,
  PASSIVE_WEIGHT,
  STRONG_MARGIN,
  SUGGEST_MARGIN,
  LOOKBACK_DAYS,
} from './decisions/personalGravity';

export {
  decideCaptureContext,
} from './decisions/captureContext';
export type { CaptureContextInput } from './decisions/captureContext';

export {
  distanceMeters,
  areSamePlace,
  DEFAULT_SAME_PLACE_THRESHOLD_M,
} from './relationships/spatial';

export type { TimePeriod, TemporalContext } from './relationships/temporal';

export {
  classifyPeriod,
  extractTemporalContext,
  utcDate,
  isSameDay,
  groupByDate,
  PERIOD_BOUNDARIES,
} from './relationships/temporal';

export type { AdjacencyPair, AggregatedAdjacency } from './relationships/sequencing';

export {
  taskIdentifier,
  orderChronologically,
  buildAdjacencyPairs,
  aggregateAdjacency,
} from './relationships/sequencing';

export type {
  ClusterPlaceAssociation,
  ClusterTimeAssociation,
  ClusterJobAssociation,
  ClusterJobEvidence,
  ClusterAssociation,
} from './associations/types';

export {
  findClusterPlaceAssociations,
  MIN_OBSERVATIONS_FOR_PLACE,
  MIN_RATIO_FOR_PLACE,
} from './associations/clusterPlace';

export {
  findClusterTimeAssociations,
  MIN_OBSERVATIONS_FOR_TIME,
  MIN_RATIO_FOR_TIME,
} from './associations/clusterTime';

export {
  findClusterJobAssociations,
  MIN_TOTAL_FOR_JOB,
} from './associations/clusterJob';

// Evidence — Phase 2 includes resolveOpenPrediction (task_id first)
export {
  logPrediction,
  recordOutcome,
  getBuffer,
  clearBuffer,
  persistPrediction,
  resolveOpenPrediction,
  recentOutcomes,
  accuracySummary,
} from './evidence';

export {
  logCapturePrediction,
  logCompletionOutcome,
} from './evidence/predictionLog';

export {
  calibrateFromOutcomes,
  learningPhaseFromCount,
  evidenceWeight,
  BASE_SOFT_FLOOR_MINS,
  ESTABLISHED_SAMPLES,
  EARLY_SAMPLES,
} from './calibration';
export type { SoftCalibration } from './calibration';

export {
  closeCompletionLoop,
  historyRowFromCompletion,
} from './evidence/closeCompletionLoop';

export {
  fetchDurationHistory,
  fetchDurationMemory,
  mapHistoryRow,
} from './loadDurationHistory';
export type {
  CloseCompletionLoopParams,
  CloseCompletionLoopResult,
} from './evidence/closeCompletionLoop';

export {
  rankActionableObservations,
  topActionableObservations,
  formatObservationLine,
} from './actionableObservations';

export {
  runObservationPipeline,
  buildEvidence,
  deriveConfidenceDimensions,
  deriveConfidence,
  classifySampleStrength,
  classifyEffectStrength,
  classifyConsistencyStrength,
  median,
  mean,
  iqr,
  standardDeviation,
  effectMagnitudeFromRatio,
  consistencyFromValues,
  daysSince,
  buildStructuredObservation,
  computeSemanticId,
  observationIdentityKey,
  deduplicateObservations,
  rankObservation,
  rankAll,
  toLocalDate,
  toLocalHour,
  toLocalDayOfWeek,
  isSameLocalDay,
  isSameUtcDay,
  utcDateStr,
  classifyLocalPeriod,
  groupByLocalDate,
  localDateDiffDays,
  detectCarryover,
  detectAllCarryovers,
  observeRepeatedCarryover,
  computeEstimateCalibration,
  observeEstimateCalibration,
  observeTimeOfDay,
  observeV2TaskContext,
  buildProportionEvidence,
  observeV2Lifecycle,
  observeV2Decomposition,
  observeV2Staleness,
  observeV2Clusters,
  buildClusterGroups,
  observeV2TemporalBehaviour,
  normalizeTemporalFacts,
  PERIOD_ORDER,
} from './v2';
export type {
  Evidence,
  ConfidenceDimensions,
  StalenessStatus,
  ContradictionStatus,
  EvidenceKind,
  StructuredObservation,
  Traceability,
  CarryoverResult,
  CarryoverKind,
  EstimateCalibration,
  ObservationPipelineConfig,
  TemporalFacts,
  Period,
} from './v2';

// ── Thinking Engine V3 ────────────────────────────────────────────
export type {
  TaskFact,
  ContextSnapshot,
  Belief,
  Prediction as V3Prediction,
  Outcome as V3Outcome,
  Decision as V3Decision,
  DecisionTrace,
  ModelState,
  ConfidenceProfile,
  DurationDistribution,
  Authority as V3Authority,
  FitState,
  ModelMaturity,
  LearningPhase,
  OutcomeKind,
  DecisionKind,
  ThinkingEventKind,
  ThinkingEvent,
} from './v3';
export {
  MODEL_VERSION as V3_MODEL_VERSION,
  ALGORITHM_VERSION as V3_ALGORITHM_VERSION,
  FEATURE_VERSION as V3_FEATURE_VERSION,
  confidenceProfileFromV1,
  emptyContextSnapshot,
  taskFactFromCompleted,
  taskFactFromHistorical,
  predictionFromLogEntry,
  outcomeFromCompletion,
  pointDistribution,
  minimalEvidence,
  currentVersions as v3CurrentVersions,
  makeEventId,
  makeDecisionId,
  buildThinkingEvent,
} from './v3';
