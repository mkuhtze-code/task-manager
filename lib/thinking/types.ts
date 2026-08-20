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
// Raw observations the engine makes about completed work. Each observation
// captures a single fact the engine noticed — e.g. "this estimate was
// off by X%" or "this cluster's average shifted Y minutes."

export type EstimateAccuracyObservation = {
  kind: 'estimate_accuracy';
  taskText: string;
  clusterLabel: string | null;
  clusterCount: number;
  estimatedMins: number;
  actualMins: number;
  ratio: number; // actual / estimated, 1.0 = perfect, <1 = faster, >1 = slower
  confidence: Confidence;
  observedAt: string; // ISO timestamp
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
  sameDayRate: number; // fraction completed same day (0-1)
  carryoverRate: number; // fraction that survived past creation day (0-1)
  avgAgeDays: number; // average age in days at completion
  sampleCount: number;
  confidence: Confidence;
  observedAt: string;
};

export type DecompositionObservation = {
  kind: 'decomposition';
  clusterLabel: string | null;
  decomposeRate: number; // fraction of tasks with subtasks (0-1)
  avgSubtaskCount: number;
  avgSubtaskMins: number;
  subtaskCompletionRate: number; // fraction of subtasks done (0-1)
  sampleCount: number;
  confidence: Confidence;
  observedAt: string;
};

export type StalenessObservation = {
  kind: 'staleness';
  clusterLabel: string | null;
  avgAgeDays: number;
  staleRate: number; // fraction of tasks older than threshold (0-1)
  completionAfterStallRate: number; // fraction completed that were old (0-1)
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

// ── Decisions ─────────────────────────────────────────────────────
// Decisions the engine makes based on observations. Each decision carries
// enough context to explain itself — why this number, not some other.

export type EffectiveEstimateDecision = {
  kind: 'effective_estimate';
  typedMins: number;
  suggestedMins: number;
  blendedMins: number;
  confidence: Confidence;
  clusterCount: number;
  divergence: number; // absolute difference between typed and suggested
  blendWeight: number;
};

// ── Evidence ──────────────────────────────────────────────────────
// Predictions the engine made at capture time, logged so outcomes can
// be compared against them later. This is the feedback loop: every
// prediction is a hypothesis, and the outcome is the test.

export type PredictionLogEntry = {
  id?: string;
  user_id: string;
  task_text: string;
  cluster_label: string | null;
  cluster_count: number;
  estimated_mins: number;
  suggested_mins: number | null;
  confidence: Confidence;
  actual_mins: number | null;
  logged_at: string;
  completed_at: string | null;
};

// ── Cluster stats for the Patterns surface ────────────────────────
// Aggregated cluster information the Patterns page can render without
// re-running the clustering itself.

export type ClusterStats = {
  label: string;
  count: number;
  avgMins: number;
  totalMins: number;
  confidence: Confidence;
  trend: 'stable' | 'improving' | 'worsening' | 'unknown';
};

// ── Activity profile (composed from observations) ─────────────────
// A per-cluster summary of behavioural characteristics. Discovered
// from evidence, not manually assigned. Describes how a type of
// activity behaves, not the person.

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

// ── User patterns (composed from all tasks) ───────────────────────
// A summary of how this particular person uses Dokkit. Not a
// personality profile — a description of interaction style.

export type UserPatterns = {
  totalCompleted: number;
  avgEstimateAccuracy: number; // avg actual/estimated ratio
  cameUpRate: number;
  estimatedRate: number;
  scheduledRate: number;
  locatedRate: number;
  jobAttachedRate: number;
  subtaskUsageRate: number;
  infoUsageRate: number;
  timerUsageRate: number;
};

// ── Decision authority (Scope 3E) ────────────────────────────────
// What Dokkit is permitted to do with the evidence. Related to
// confidence but not identical: confidence measures "how much
// evidence exists?", authority measures "what may Dokkit do?"

export type DecisionAuthority = 'observe' | 'suggest' | 'strong';

// ── Contextual decisions (Scope 3E) ──────────────────────────────
// Decisions that consume contextual evidence to make small, useful,
// deterministic suggestions. Each decision carries enough context
// to explain itself — why this job, not some other.

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

// ── Surface type (Personal Gravity, Scope 3G) ────────────────────
// The three primary surfaces the user navigates between. Navigation
// events reference these identifiers; the decision layer aggregates
// them to discover demonstrated surface preference.

export type Surface = 'today' | 'jobs' | 'travel';

// ── Surface event (Personal Gravity observation) ─────────────────
// A lightweight observation of which surface the user opened and
// how they got there. 'active' means they deliberately navigated
// to this surface (e.g. tapped TopSwitcher). Passive exposure
// (landing on Today by default) sets active = false.

export type SurfaceEvent = {
  id: string;
  user_id: string;
  surface: Surface;
  active: boolean;
  created_at: string;
};

// ── Personal Gravity decision (Scope 3G) ────────────────────────
// The result of the personal gravity decision layer. Determines
// whether the user has demonstrated a meaningful, persistent
// preference for a particular surface. Authority follows the
// existing observe/suggest/strong model:
//
//   observe  — evidence exists but is insufficient for action
//   suggest  — emerging preference, may inform subtle defaults
//   strong   — clear demonstrated preference, surface may adapt
//
// When no decision can be made (insufficient evidence, competing
// surfaces, too-close margins), preferredSurface is null.

export type PersonalGravityDecision = {
  kind: 'personal_gravity';
  preferredSurface: Surface | null;
  authority: DecisionAuthority;
  evidence: {
    bySurface: Record<Surface, { active: number; passive: number }>;
    totalEvents: number;
    daysObserved: number;
  };
  margin: number; // score difference between top two surfaces (0-1)
};

// ── Capture context decision (Scope 3H) ─────────────────────────
// A composed decision that unifies all capture-time signals into a
// single context. This is the Thinking Engine's output at capture
// time — the UI consumes it without needing to understand individual
// decision layers.
//
// The authority follows the existing observe/suggest/strong model:
//   observe  — weak or no context, do not auto-fill
//   suggest  — emerging context, may show suggestion chips
//   strong   — confident context, auto-fill silently
//
// source explains where the context came from, for inspection and
// testability — not exposed in the UI.

export type CaptureContextDecision = {
  kind: 'capture_context';
  suggestedJobId: string | null;
  suggestedLocation: { text: string; lat: number; lng: number } | null;
  authority: DecisionAuthority;
  source: 'explicit_job' | 'text_match' | 'location_memory' | 'gravity' | null;
};
