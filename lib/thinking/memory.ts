// lib/thinking/memory.ts
//
// Duration memory with optional time-decay. This module answers one
// question: given a history of actual durations for a cluster, what
// should the engine predict for the next time this kind of task appears?
//
// Two modes:
//   1. Simple average (matching existing behavior) — equal weight to
//      every completed instance. Used when the cluster is small or the
//      user hasn't asked for decay.
//   2. Exponential decay — more recent completions weigh heavier. Useful
//      for tasks where the person's speed changes over time (e.g. as
//      they get familiar with a route, or their workload increases).

import type { Confidence } from './types';
import { classifyConfidence } from './confidence';

// ── Simple average (matches existing behavior) ────────────────────

export function averageDuration(actuals: number[]): number {
  if (actuals.length === 0) return 0;
  const sum = actuals.reduce((a, b) => a + b, 0);
  return Math.round(sum / actuals.length);
}

// ── Exponential decay average ─────────────────────────────────────
// Half-life in "completions" — after this many subsequent completions,
// the weight of an observation drops to 50%. A half-life of 5 means
// the most recent ~5 completions dominate the average, while older
// data gently fades.
//
// This is deliberately exposed but not the default path — the simple
// average matches what taskIntelligence.ts already does, and we don't
// want to silently change behavior. It's here so the engine can opt in
// to decay once there's enough history to measure whether decay helps.

export function decayWeightedAverage(
  actuals: number[],
  halfLife: number = 5
): number {
  if (actuals.length === 0) return 0;
  if (actuals.length === 1) return actuals[0];

  const decayRate = Math.log(2) / halfLife;
  let weightedSum = 0;
  let weightSum = 0;

  // Walk from oldest to newest. Index 0 is the oldest completion,
  // index (n-1) is the most recent.
  for (let i = 0; i < actuals.length; i++) {
    const age = actuals.length - 1 - i; // 0 = most recent
    const weight = Math.exp(-decayRate * age);
    weightedSum += actuals[i] * weight;
    weightSum += weight;
  }

  return Math.round(weightedSum / weightSum);
}

// ── Trend detection ───────────────────────────────────────────────
// Is the cluster getting faster, slower, or staying about the same?
// Uses a simple split comparison: compare the first half of completions
// to the second half. If the difference is small, call it stable.

export function detectTrend(actuals: number[]): 'stable' | 'improving' | 'worsening' {
  if (actuals.length < 3) return 'stable'; // not enough data for trend

  const midpoint = Math.floor(actuals.length / 2);
  const firstHalf = actuals.slice(0, midpoint);
  const secondHalf = actuals.slice(midpoint);

  const avgFirst = averageDuration(firstHalf);
  const avgSecond = averageDuration(secondHalf);

  // Less than 10% shift in either direction → stable
  const changeRatio = avgFirst > 0 ? (avgSecond - avgFirst) / avgFirst : 0;
  if (Math.abs(changeRatio) < 0.10) return 'stable';
  if (changeRatio < 0) return 'improving'; // getting faster
  return 'worsening'; // getting slower
}

// ── Cluster summary ───────────────────────────────────────────────
// Given raw completion data for a cluster, compute the summary stats
// the Patterns surface needs.

export function summarizeCluster(
  actuals: number[],
  label: string
): {
  avgMins: number;
  totalMins: number;
  confidence: Confidence;
  trend: 'stable' | 'improving' | 'worsening';
} {
  const avgMins = averageDuration(actuals);
  const totalMins = actuals.reduce((a, b) => a + b, 0);
  const confidence = classifyConfidence(actuals.length);
  const trend = detectTrend(actuals);
  return { avgMins, totalMins, confidence, trend };
}
