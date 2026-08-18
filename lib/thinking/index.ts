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

// Observations — Scope 1
export {
  observeEstimateAccuracy,
  classifyAccuracy,
  summarizeAccuracy,
} from './observations/estimateAccuracy';

export {
  observeDurationMemory,
  observeAllClusters,
} from './observations/durationMemory';

// Observations — Scope 2
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

// Compose
export {
  buildActivityProfile,
  buildAllActivityProfiles,
} from './compose/activityProfile';

export {
  buildUserPatterns,
} from './compose/userPatterns';

// Decisions
export {
  computeEffectiveEstimate,
  effectiveEstimate,
  hasMeaningfulDivergence,
} from './decisions/effectiveEstimate';

// Relationships — Scope 3A
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

// Associations — Scope 3B
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

// Evidence
export {
  logPrediction,
  recordOutcome,
  getBuffer,
  clearBuffer,
  persistPrediction,
  recentOutcomes,
  accuracySummary,
} from './evidence';

export {
  logCapturePrediction,
  logCompletionOutcome,
} from './evidence/predictionLog';
