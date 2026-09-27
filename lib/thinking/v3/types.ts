// lib/thinking/v3/types.ts
//
// Canonical contracts for Thinking Engine V3.
//
// Principle: Facts → Evidence → Beliefs → Predictions → Outcomes → Calibration
//
// These types are the single language the engine speaks. Existing V1/V2
// shapes adapt into these; runtime paths switch only after adapters and
// tests exist. Unknown remains unknown — never coerce missing to false/0
// unless the semantics of the field require it.
//
// No network. No Date.now() inside pure builders (pass `now` explicitly).
// No LLM. Deterministic.

import type { Confidence as V1Confidence } from '../types';

export type Confidence = V1Confidence;

export type Authority = 'observe' | 'suggest' | 'strong';

export type ModelMaturity =
  | 'cold'
  | 'warming'
  | 'forming'
  | 'stable'
  | 'drifting'
  | 'uncertain';

export type LearningPhase = 'prior' | 'early' | 'forming' | 'established';

export type OutcomeKind =
  | 'done'
  | 'partial'
  | 'carry'
  | 'skip'
  | 'resume'
  | 'edited';

export type DecisionKind =
  | 'effective_duration'
  | 'fit'
  | 'carry_suitability'
  | 'capture_context'
  | 'job_context'
  | 'location_memory'
  | 'personal_gravity'
  | 'capacity'
  | 'sequence';

export type FitState =
  | 'strong'
  | 'possible'
  | 'poor'
  | 'blocked'
  | 'unknown'
  | 'protect'
  | 'carry_safe'
  | 'needs_context'
  | 'uncertain';

export type EvidenceKind =
  | 'raw_fact'
  | 'derived_measurement'
  | 'association'
  | 'observation'
  | 'hypothesis';

export type StalenessStatus = 'current' | 'stale';
export type ContradictionStatus = 'none' | 'partial' | 'full';

export type DurationDistribution = {
  expectedMins: number;
  interval: { low: number; high: number };
  sampleSize: number;
  method:
    | 'median'
    | 'trimmed_mean'
    | 'weighted_median'
    | 'prior'
    | 'typed'
    | 'lifecycle_soft'
    | 'blended';
};

export type ConfidenceProfile = {
  overall: Confidence;
  sampleStrength: Confidence;
  effectStrength: Confidence;
  consistencyStrength: Confidence;
  recencyWeight: number | null;

  // Specificity is allowed to be unknown when the available evidence
  // cannot establish how context-specific the observation is.
  specificity: number | null;

  contradiction: ContradictionStatus;
  staleness: StalenessStatus;
};

export type TaskFact = {
  taskId: string;
  userId: string;
  text: string;
  status: string;
  estimateMins: number | null;
  actualMins: number | null;
  loggedMins: number | null;
  jobId: string | null;
  locationText: string | null;
  lat: number | null;
  lng: number | null;
  surfaceDate: string | null;
  dueToday: boolean | null;
  intendedTime: string | null;
  createdAt: string;
  completedAt: string | null;
  startedAt: string | null;
  source: string | null;
  subtaskCount: number;
};

export type ContextSnapshot = {
  snapshotId: string;
  userId: string;
  at: string;
  jobId: string | null;
  locationText: string | null;
  lat: number | null;
  lng: number | null;
  localHour: number | null;
  dayOfWeek: number | null;
  surface: string | null;
  capacityRemainingMins: number | null;
};

export type Evidence = {
  evidenceId: string;
  kind: EvidenceKind;
  subject: string;
  value: unknown;
  weight: number;
  sourceIds: string[];
  recordedAt: string;
};

export type Belief = {
  beliefId: string;
  dimension: string;
  subject: {
    clusterLabel: string | null;
    clusterId: string | null;
    jobId: string | null;
    locationKey: string | null;
    userWide: boolean;
  };
  value: unknown;
  confidence: ConfidenceProfile;
  authority: Authority;
  evidenceIds: string[];
  origin: 'observed' | 'prior' | 'derived';
  modelVersion: string;
  updatedAt: string;
};

export type Prediction = {
  predictionId: string;
  taskId: string;
  modelVersion: string;
  value: number;
  interval: { low: number; high: number };
  confidence: ConfidenceProfile;
  authority: Authority;
  evidenceIds: string[];
  timestamp: string;
};

export type Outcome = {
  outcomeId: string;
  predictionId: string | null;
  taskId: string;
  kind: OutcomeKind;
  actualMins: number | null;
  predictedMins: number | null;
  recordedAt: string;
};

export type Decision = {
  decisionId: string;
  kind: DecisionKind;
  taskId: string | null;
  value: unknown;
  authority: Authority;
  confidence: ConfidenceProfile;
  reasonCodes: string[];
  modelVersion: string;
  timestamp: string;
};

export type DecisionTrace = {
  decisionId: string;
  steps: string[];
  evidenceIds: string[];
  beliefIds: string[];
};

export type ModelState = {
  userId: string;
  modelVersion: string;
  maturity: ModelMaturity;
  learningPhase: LearningPhase;
  closedSampleCount: number;
  priors: {
    softFloorMins: number;
    anchorSameDayRate: number;
    flexibleSameDayRate: number;
    blendScale: number;
  };
  calibration: {
    durationBias: number | null;
    durationMae: number | null;
    intervalCoverage: number | null;
    explain: string | null;
  };
  beliefIds: string[];
  updatedAt: string;
};

export const MODEL_VERSION = '3.0.0-phase5';
export const ALGORITHM_VERSION = '3.0.0';
export const FEATURE_VERSION = '3.0.0';
