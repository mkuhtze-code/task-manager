// lib/thinking/v3/types.ts
//
// Canonical contracts for Thinking Engine V3.
// Phase 9 — decision traces (structured Decision + DecisionTrace).

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
  specificity: number | null;
  contradiction: ContradictionStatus;
  staleness: StalenessStatus;
};

export type TaskFact = {
  taskId: string;
  userId: string;
  text: string;
  clusterLabel: string | null;
  clusterId: string | null;
  clusterVersion: number | null;
  jobId: string | null;
  locationText: string | null;
  lat: number | null;
  lng: number | null;
  typedEstimateMins: number | null;
  observedMins: number | null;
  loggedMins: number;
  remainingMins: number | null;
  status:
    | 'open'
    | 'active'
    | 'done'
    | 'partial'
    | 'carried'
    | 'skipped';
  source: 'planned' | 'came_up' | 'imported' | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  surfaceDate: string | null;
  intendedTime: string | null;
  dueToday: boolean | null;
  subtaskCount: number;
  subtaskDoneCount: number;
  subtaskTotalMins: number;
  carryCount: number | null;
  novel: boolean | null;
};

export type ContextSnapshot = {
  at: string;
  timezone: string;
  temporal: {
    localDate: string | null;
    localHour: number | null;
    dayOfWeek: number | null;
    period:
      | 'early'
      | 'morning'
      | 'midday'
      | 'afternoon'
      | 'evening'
      | 'night'
      | null;
    isWorkday: boolean | null;
  };
  spatial: {
    locationText: string | null;
    lat: number | null;
    lng: number | null;
    placeId: string | null;
  };
  work: {
    jobId: string | null;
    folderId: string | null;
    projectLabel: string | null;
  };
  calendar: {
    remainingWindowMins: number | null;
    meetingDensity: number | null;
    hasTravelBlock: boolean | null;
  };
  lifecycle: {
    taskAgeDays: number | null;
    carryCount: number | null;
    previousPartials: number | null;
  };
  sequence: {
    previousTaskId: string | null;
    previousClusterLabel: string | null;
    nextCommitmentAt: string | null;
  };
};

export type Evidence = {
  evidenceId: string;
  kind: EvidenceKind;
  label: string;
  sampleSize: number;
  effectMagnitude: number | null;
  consistency: number | null;
  variance: number | null;
  recencyDays: number | null;
  specificity: number | null;
  contradictionCount: number;
  missingDataCount: number;
  insufficient: boolean;
  sourceRefs: string[];
  measurements: unknown[];
  createdAt: string;
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
  value: number | DurationDistribution | Record<string, unknown>;
  confidence: ConfidenceProfile;
  authority: Authority;
  evidenceIds: string[];
  origin: 'system_prior' | 'onboarding_prior' | 'observed' | 'posterior';
  modelVersion: string;
  updatedAt: string;
};

export type Prediction = {
  predictionId: string;
  taskId: string | null;
  userId: string;
  kind: DecisionKind | 'duration' | 'same_day' | 'carry' | 'fit' | 'context';
  predicted: {
    value: number | string | boolean | DurationDistribution | FitState | null;
    interval: { low: number; high: number } | null;
  };
  confidence: ConfidenceProfile;
  authority: Authority;
  typedEstimateMins: number | null;
  planningEstimateMins: number | null;
  context: ContextSnapshot;
  evidenceIds: string[];
  decisionId: string | null;
  modelVersion: string;
  algorithmVersion: string;
  featureVersion: string;
  createdAt: string;
  outcomeId: string | null;
  resolvedAt: string | null;
};

export type Outcome = {
  outcomeId: string;
  predictionId: string | null;
  taskId: string;
  userId: string;
  kind: OutcomeKind;
  measuredMins: number | null;
  trainMins: number | null;
  remainingMins: number | null;
  trainSource: 'measured' | 'lifecycle' | 'none';
  error: {
    signedMins: number | null;
    absoluteMins: number | null;
    relative: number | null;
  } | null;
  context: ContextSnapshot | null;
  createdAt: string;
};

export type Decision = {
  decisionId: string;
  kind: DecisionKind;
  value: number | string | boolean | FitState | DurationDistribution | null;
  interval: { low: number; high: number } | null;
  confidence: ConfidenceProfile;
  authority: Authority;
  uncertainty: {
    risk: 'low' | 'medium' | 'high' | 'unknown';
    spreadMins: number | null;
  };
  evidenceIds: string[];
  predictionId: string | null;
  modelVersion: string;
  createdAt: string;
  reasons: string[];
};

export type DecisionTrace = {
  decisionId: string;
  predictionId: string | null;
  modelVersion: string;
  algorithmVersion: string;
  evidenceIds: string[];
  steps: Array<{ stage: string; detail: string; refs?: string[] }>;
  inputs: {
    taskId: string | null;
    typedEstimateMins: number | null;
    contextAt: string | null;
  };
  createdAt: string;
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

export const MODEL_VERSION = '3.1.0-s3';
export const ALGORITHM_VERSION = '3.0.0';
export const FEATURE_VERSION = '3.1.0-s3-regime-leaf';
