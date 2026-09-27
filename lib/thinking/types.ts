// lib/thinking/types.ts
//
// Core type definitions for the thinking engine. Every module in the engine
// speaks this language — observations produce these, decisions consume them,
// and evidence records them. Kept in one place so adding a new observation
// or decision never requires hunting across files to understand the contract.

export type Confidence = 'low' | 'medium' | 'high';

// ── Input contract ────────────────────────────────────────────────
// The single input shape for all observation functions. Represents a
// completed task with its subtask summary. Every observation module
// takes CompletedTaskFacts[] — no Supabase calls, no side effects.

export type CompletedTaskFacts = {
  text: string;
  status: 'done';
  source: 'planned' | 'came_up';
  estimate_mins: number;
  actual_mins: number | null;
  logged_mins: number;
  created_at: string;
  completed_at: string | null;
  started_at: string | null;
  surface_date: string | null;
  location_text: string | null;
  lat: number | null;
  lng: number | null;
  job_id: string | null;
  info: string | null;
  subtaskCount: number;
  subtaskDoneCount: number;
  subtaskTotalMins: number;
};

// ── Observations ──────────────────────────────────────────────────
export type EstimateAccuracyObservation = {
  kind: 'estimate_accuracy';
  taskText: string;
  clusterLabel: string | null;
  clusterCount: number;
  estimatedMins: number;
  actualMins: number;
  ratio: number;
  confidence: Confidence;
  observedAt: string;
};

export type DurationMemoryObservation = {
  kind: 'duration_memory';
  clusterLabel: string;
  clusterCount: number;
  avgMins: number;
  totalMins: number;
  lastActualMins: number;
  trend: 'stable' | 'improving' | 'worsening';
  confidence: Confidence;
  observedAt: string;
};

export type LifecycleObservation = {
  kind: 'lifecycle';
  clusterLabel: string | null;
  avgDaysToCompletion: number;
  sameDayRate: number;
  carryoverRate: number;
  avgAgeDays: number;
  sampleCount: number;
  confidence: Confidence;
  observedAt: string;
};

export type DecompositionObservation = {
  kind: 'decomposition';
  clusterLabel: string | null;
  decomposeRate: number;
  avgSubtaskCount: number;
  avgSubtaskMins: number;
  subtaskCompletionRate: number;
  sampleCount: number;
  confidence: Confidence;
  observedAt: string;
};

export type StalenessObservation = {
  kind: 'staleness';
  clusterLabel: string | null;
  avgAgeDays: number;
  staleRate: number;
  completionAfterStallRate: number;
  sampleCount: number;
  confidence: Confidence;
  observedAt: string;
};

export type PlanningObservation = {
  kind: 'planning';
  clusterLabel: string | null;
  cameUpRate: number;
  estimatedRate: number;
  scheduledRate: number;
  locatedRate: number;
  jobAttachedRate: number;
  infoRate: number;
  timerUsedRate: number;
  sampleCount: number;
  confidence: Confidence;
  observedAt: string;
};

export type ClusterBehaviourObservation = {
  kind: 'cluster_behaviour';
  clusterLabel: string;
  count: number;
  avgMins: number;
  avgAgeDays: number;
  sameDayRate: number;
  decomposeRate: number;
  locatedRate: number;
  jobRate: number;
  cameUpRate: number;
  avgSubtaskCount: number;
  confidence: Confidence;
  observedAt: string;
};

export type Observation =
  | EstimateAccuracyObservation
  | DurationMemoryObservation
  | LifecycleObservation
  | DecompositionObservation
  | StalenessObservation
  | PlanningObservation
  | ClusterBehaviourObservation;

export type EffectiveEstimateDecision = {
  kind: 'effective_estimate';
  typedMins: number;
  suggestedMins: number;
  blendedMins: number;
  confidence: Confidence;
  clusterCount: number;
  divergence: number;
  blendWeight: number;
};

// ── Evidence (Phase 2: task_id primary identity) ───────────────────
export type PredictionLogEntry = {
  id?: string;
  user_id: string;
  /** Stable task identity — primary key for outcome linkage (Phase 2). */
  task_id?: string | null;
  task_text: string;
  cluster_label: string | null;
  cluster_count: number;
  estimated_mins: number;
  suggested_mins: number | null;
  confidence: Confidence;
  actual_mins: number | null;
  logged_at: string;
  completed_at: string | null;
  model_version?: string | null;
  algorithm_version?: string | null;
  feature_version?: string | null;
  outcome_kind?: 'done' | 'partial' | 'carry' | 'skip' | 'resume' | 'edited' | null;
  decision_id?: string | null;
};

export type ClusterStats = {
  label: string;
  count: number;
  avgMins: number;
  totalMins: number;
  confidence: Confidence;
  trend: 'stable' | 'improving' | 'worsening' | 'unknown';
};

export type ActivityProfile = {
  clusterLabel: string;
  count: number;
  confidence: Confidence;
  avgDaysToCompletion: number;
  sameDayRate: number;
  carryoverRate: number;
  decomposeRate: number;
  avgSubtaskCount: number;
  cameUpRate: number;
  estimatedRate: number;
  locatedRate: number;
  jobRate: number;
  staleRate: number;
  avgMins: number;
  trend: 'stable' | 'improving' | 'worsening';
};

export type UserPatterns = {
  totalCompleted: number;
  avgEstimateAccuracy: number;
  cameUpRate: number;
  estimatedRate: number;
  scheduledRate: number;
  locatedRate: number;
  jobAttachedRate: number;
  subtaskUsageRate: number;
  infoUsageRate: number;
  timerUsageRate: number;
};

export type DecisionAuthority = 'observe' | 'suggest' | 'strong';

export type JobContextDecision = {
  kind: 'job_context';
  jobId: string;
  confidence: Confidence;
  authority: DecisionAuthority;
  evidence: {
    direct: { count: number; total: number };
    spatial: { count: number; total: number };
    temporal: { count: number; total: number };
    sequence: { count: number; total: number };
  };
  agreeingDimensions: ('direct' | 'spatial' | 'temporal' | 'sequence')[];
};

export type LocationMemoryDecision = {
  kind: 'location_memory';
  locationText: string;
  lat: number;
  lng: number;
  confidence: Confidence;
  authority: DecisionAuthority;
  occurrenceCount: number;
  ratio: number;
};

export type Surface = 'today' | 'jobs' | 'travel';

export type SurfaceEvent = {
  id: string;
  user_id: string;
  surface: Surface;
  active: boolean;
  created_at: string;
};

export type PersonalGravityDecision = {
  kind: 'personal_gravity';
  preferredSurface: Surface | null;
  authority: DecisionAuthority;
  evidence: {
    bySurface: Record<Surface, { active: number; passive: number }>;
    totalEvents: number;
    daysObserved: number;
  };
  margin: number;
};

export type CaptureContextDecision = {
  kind: 'capture_context';
  suggestedJobId: string | null;
  suggestedLocation: { text: string; lat: number; lng: number } | null;
  authority: DecisionAuthority;
  source: 'explicit_job' | 'text_match' | 'location_memory' | 'gravity' | null;
};
