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

// ── Primitive vocabulary ──────────────────────────────────────────

/** Evidence strength. Prefer multi-dimensional ConfidenceProfile where possible. */
export type Confidence = V1Confidence; // 'low' | 'medium' | 'high'

/**
 * What Dokkit is allowed to do with a belief.
 * Distinct from confidence: high confidence may still only observe.
 */
export type Authority = 'observe' | 'suggest' | 'strong';

/** Model maturity — separate from per-decision confidence. */
export type ModelMaturity =
  | 'cold'
  | 'warming'
  | 'forming'
  | 'stable'
  | 'drifting'
  | 'uncertain';

/** Learning phase aligned to first billing cycle. */
export type LearningPhase = 'prior' | 'early' | 'forming' | 'established';

/** Outcome kinds from Reality Check / ambient completion. */
export type OutcomeKind =
  | 'done'
  | 'partial'
  | 'carry'
  | 'skip'
  | 'resume'
  | 'edited';

/** Decision kinds the engine may emit. */
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

/** Fit states — structured, not a single priority score. */
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

/** Evidence reasoning level — never silently promote. */
export type EvidenceKind =
  | 'raw_fact'
  | 'derived_measurement'
  | 'association'
  | 'observation'
  | 'hypothesis';

export type StalenessStatus = 'current' | 'stale';
export type ContradictionStatus = 'none' | 'partial' | 'full';

// ── Duration distribution (not just a point) ──────────────────────

/**
 * Internal duration belief. Surface only useful precision to users.
 * Interval is often more useful for planning than a single number.
 */
export type DurationDistribution = {
  /** Central tendency (prefer median / robust centre). */
  expectedMins: number;
  /** Typical range — planning risk budget. */
  interval: { low: number; high: number };
  /** Sample size that produced this (0 = prior only). */
  sampleSize: number;
  /** How the centre was derived. */
  method: 'median' | 'trimmed_mean' | 'weighted_median' | 'prior' | 'typed' | 'lifecycle_soft' | 'blended';
};

// ── Multi-dimensional confidence ──────────────────────────────────

/**
 * Sample-count confidence is not enough.
 * A model with 20 old observations is not necessarily stronger than
 * 7 recent observations in almost identical context.
 */
export type ConfidenceProfile = {
  overall: Confidence;
  sampleStrength: Confidence;
  effectStrength: Confidence;
  consistencyStrength: Confidence;
  /** 0–1 where known; null = unknown (do not treat as 0). */
  recencyWeight: number | null;
  specificity: number | null;
  contradiction: ContradictionStatus;
  staleness: StalenessStatus;
};

// ── TaskFact ──────────────────────────────────────────────────────

/**
 * Canonical fact about a task at a point in time.
 * Identity is taskId — text is evidence/context, never primary identity.
 * Unknown fields stay null/undefined; do not invent.
 */
export type TaskFact = {
  taskId: string;
  userId: string;
  text: string;
  /** Semantic cluster label when known; null if novel / unmatched. */
  clusterLabel: string | null;
  /** Versioned cluster identity when available (Phase 4+). */
  clusterId: string | null;
  clusterVersion: number | null;

  jobId: string | null;
  locationText: string | null;
  lat: number | null;
  lng: number | null;

  /** User-typed estimate — never silently rewritten. */
  typedEstimateMins: number | null;
  /** Observed / measured duration when reliable. */
  observedMins: number | null;
  /** Logged timer bank (may include unreliable zeros). */
  loggedMins: number;
  /** Remaining work after partial, when known. */
  remainingMins: number | null;

  status: 'open' | 'active' | 'done' | 'partial' | 'carried' | 'skipped';
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

  /** Carry count across days when known. */
  carryCount: number | null;
  /** Novelty flag — no useful historical analogue. */
  novel: boolean | null;
};

// ── ContextSnapshot ───────────────────────────────────────────────

/**
 * Context at the moment of a prediction or decision.
 * Missing dimensions must not be treated as negative evidence.
 */
export type ContextSnapshot = {
  /** ISO timestamp of snapshot; wall-clock passed in, never Date.now() inside pure code. */
  at: string;
  timezone: string;

  temporal: {
    localDate: string | null;
    localHour: number | null;
    dayOfWeek: number | null; // 0=Sun … 6=Sat local
    period: 'early' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night' | null;
    isWorkday: boolean | null;
  };

  spatial: {
    locationText: string | null;
    lat: number | null;
    lng: number | null;
    /** Recurring place id when known. */
    placeId: string | null;
  };

  work: {
    jobId: string | null;
    folderId: string | null;
    projectLabel: string | null;
  };

  calendar: {
    /** Remaining open work window in minutes, if known. */
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

// ── Evidence ──────────────────────────────────────────────────────

/**
 * Explicit evidence package supporting a belief or prediction.
 * Traceable: a decision can list evidenceIds that supported it.
 */
export type Evidence = {
  evidenceId: string;
  kind: EvidenceKind;
  /** Human-readable label for diagnostics (not user-facing). */
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
  /** Stable references into source facts / events. */
  sourceRefs: string[];
  /** Opaque measurements for diagnostics. */
  measurements: unknown[];
  createdAt: string;
};

// ── Belief ────────────────────────────────────────────────────────

/**
 * What the engine currently believes is likely.
 * Separate from Fact (observed) and Decision (what we do with the belief).
 */
export type Belief = {
  beliefId: string;
  /** e.g. duration, same_day_rate, carry_rate, job_association */
  dimension: string;
  subject: {
    clusterLabel: string | null;
    clusterId: string | null;
    jobId: string | null;
    locationKey: string | null;
    userWide: boolean;
  };
  /** Point or distribution depending on dimension. */
  value: number | DurationDistribution | Record<string, unknown>;
  confidence: ConfidenceProfile;
  authority: Authority;
  evidenceIds: string[];
  /** prior | observed | posterior */
  origin: 'system_prior' | 'onboarding_prior' | 'observed' | 'posterior';
  modelVersion: string;
  updatedAt: string;
};

// ── Prediction ────────────────────────────────────────────────────

/**
 * Immutable historical hypothesis. Once created it is never silently
 * overwritten. Outcome and calibration attach later.
 */
export type Prediction = {
  predictionId: string;
  taskId: string | null;
  userId: string;
  kind: DecisionKind | 'duration' | 'same_day' | 'carry' | 'fit' | 'context';

  /** What Dokkit believed at prediction time. */
  predicted: {
    value: number | string | boolean | DurationDistribution | FitState | null;
    interval: { low: number; high: number } | null;
  };

  confidence: ConfidenceProfile;
  authority: Authority;

  /** Typed estimate at capture — never rewritten. */
  typedEstimateMins: number | null;
  /** Planning estimate used for capacity (may differ from typed). */
  planningEstimateMins: number | null;

  context: ContextSnapshot;
  evidenceIds: string[];
  decisionId: string | null;

  modelVersion: string;
  algorithmVersion: string;
  featureVersion: string;

  createdAt: string;
  /** Outcome attached later; null until resolved. */
  outcomeId: string | null;
  resolvedAt: string | null;
};

// ── Outcome ───────────────────────────────────────────────────────

/**
 * What actually happened. Linked to a prediction by stable id.
 * Different outcome kinds inform different learning dimensions —
 * do not poison duration learning with pure carry signals.
 */
export type Outcome = {
  outcomeId: string;
  predictionId: string | null;
  taskId: string;
  userId: string;
  kind: OutcomeKind;

  /** Reliable measured minutes when applicable. */
  measuredMins: number | null;
  /** Minutes allowed to train duration memory (null = do not train). */
  trainMins: number | null;
  remainingMins: number | null;

  /** Source of trainMins. */
  trainSource: 'measured' | 'lifecycle' | 'none';

  /** Error vs prediction when both exist. */
  error: {
    signedMins: number | null;
    absoluteMins: number | null;
    relative: number | null;
  } | null;

  context: ContextSnapshot | null;
  createdAt: string;
};

// ── Decision ──────────────────────────────────────────────────────

/**
 * Structured decision object — never return anonymous numbers from the brain.
 */
export type Decision = {
  decisionId: string;
  kind: DecisionKind;
  /** Primary value; interpretation depends on kind. */
  value: number | string | boolean | FitState | DurationDistribution | null;
  interval: { low: number; high: number } | null;
  confidence: ConfidenceProfile;
  authority: Authority;
  uncertainty: {
    /** Qualitative risk for planning. */
    risk: 'low' | 'medium' | 'high' | 'unknown';
    spreadMins: number | null;
  };
  evidenceIds: string[];
  predictionId: string | null;
  modelVersion: string;
  createdAt: string;
  /** Internal reasons for diagnostics / future Patterns. */
  reasons: string[];
};

// ── DecisionTrace ─────────────────────────────────────────────────

/**
 * Full internal explainability. User never sees this unless they open
 * a technical inspection surface.
 */
export type DecisionTrace = {
  decisionId: string;
  predictionId: string | null;
  modelVersion: string;
  algorithmVersion: string;
  evidenceIds: string[];
  steps: Array<{
    stage: string;
    detail: string;
    refs?: string[];
  }>;
  inputs: {
    taskId: string | null;
    typedEstimateMins: number | null;
    contextAt: string | null;
  };
  createdAt: string;
};

// ── ModelState ────────────────────────────────────────────────────

/**
 * Durable personal model snapshot for a user.
 * Derived structures can be rebuilt from events; this is the working view.
 */
export type ModelState = {
  userId: string;
  modelVersion: string;
  maturity: ModelMaturity;
  learningPhase: LearningPhase;

  /** Closed prediction loops used for calibration. */
  closedSampleCount: number;

  priors: {
    softFloorMins: number;
    anchorSameDayRate: number;
    flexibleSameDayRate: number;
    blendScale: number;
  };

  /** High-level calibration of the engine's own predictions. */
  calibration: {
    durationBias: number | null;
    durationMae: number | null;
    intervalCoverage: number | null;
    explain: string | null;
  };

  /** Opaque cluster / belief index refs (implementation detail). */
  beliefIds: string[];
  updatedAt: string;
};

// ── Version constants ─────────────────────────────────────────────

/** Bump when prediction semantics or algorithm change. */
export const MODEL_VERSION = '3.0.0-phase1';
export const ALGORITHM_VERSION = '3.0.0-phase1';
export const FEATURE_VERSION = '3.0.0-phase1';
