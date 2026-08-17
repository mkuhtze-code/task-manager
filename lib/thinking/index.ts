// lib/thinking/index.ts
//
// Public API for the thinking engine. Re-exports the pieces that
// the rest of the app needs, keeping the internal module structure
// private.

// Foundation
export type {
  Confidence,
  EstimateAccuracyObservation,
  DurationMemoryObservation,
  Observation,
  EffectiveEstimateDecision,
  PredictionLogEntry,
  ClusterStats,
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

// Observations
export {
  observeEstimateAccuracy,
  classifyAccuracy,
  summarizeAccuracy,
} from './observations/estimateAccuracy';

export {
  observeDurationMemory,
  observeAllClusters,
} from './observations/durationMemory';

// Decisions
export {
  computeEffectiveEstimate,
  effectiveEstimate,
  hasMeaningfulDivergence,
} from './decisions/effectiveEstimate';

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
