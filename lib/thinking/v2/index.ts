export {
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
} from './evidence';
export type {
  Evidence,
  ConfidenceDimensions,
  StalenessStatus,
  ContradictionStatus,
  EvidenceKind,
} from './evidence';

export {
  buildStructuredObservation,
} from './observations';
export type {
  StructuredObservation,
  Traceability,
} from './observations';

export {
  computeSemanticId,
  observationIdentityKey,
} from './identity';

export {
  deduplicateObservations,
} from './dedup';

export {
  rankObservation,
  rankAll,
} from './ranking';

export {
  toLocalDate,
  toLocalHour,
  toLocalDayOfWeek,
  isSameLocalDay,
  isSameUtcDay,
  utcDateStr,
  classifyLocalPeriod,
  groupByLocalDate,
  localDateDiffDays,
} from './timezone';

export {
  detectCarryover,
  detectAllCarryovers,
  observeRepeatedCarryover,
} from './carryover';
export type {
  CarryoverResult,
  CarryoverKind,
} from './carryover';

export {
  computeEstimateCalibration,
  observeEstimateCalibration,
} from './calibration';
export type {
  EstimateCalibration,
} from './calibration';

export {
  observeTimeOfDay,
} from './timeOfDay';

export {
  observeV2TaskContext,
  buildProportionEvidence,
} from './taskContext';

export {
  observeV2Lifecycle,
} from './lifecycle';

export {
  observeV2Decomposition,
} from './decomposition';

export {
  observeV2Staleness,
} from './staleness';

export {
  observeV2Clusters,
} from './cluster';

export {
  buildClusterGroups,
} from './clusterGroups';
export type {
  ClusterGroup,
} from './clusterGroups';

export {
  runObservationPipeline,
} from './pipeline';
export type {
  ObservationPipelineConfig,
} from './pipeline';
