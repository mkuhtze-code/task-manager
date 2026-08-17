// lib/thinking/types.ts
//
// Core type definitions for the thinking engine. Every module in the engine
// speaks this language — observations produce these, decisions consume them,
// and evidence records them. Kept in one place so adding a new observation
// or decision never requires hunting across files to understand the contract.

export type Confidence = 'low' | 'medium' | 'high';

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

export type Observation = EstimateAccuracyObservation | DurationMemoryObservation;

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
