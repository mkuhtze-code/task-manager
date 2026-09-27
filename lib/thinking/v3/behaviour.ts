// lib/thinking/v3/behaviour.ts
//
// Phase 6 — user behavioural model (engine-internal).
//
// Learns patterns from ordinary use:
//   estimation bias, carry tendency, variance, same-day behaviour.
//
// Pure. Deterministic. No network. Not surfaced as coaching.

import { median, madScaled } from './stats';
import { calibrateFromPairs, type CalibrationPair } from './calibrationMetrics';
import { sameLocalCalendarDay, completionAgeDays } from './temporal';
import {
  buildClusterModels,
  matchCluster,
  type HistorySample,
  type ClusterModel,
} from './clusters';
import type { Confidence } from './types';
import { MODEL_VERSION } from './types';

export type BehaviourSample = {
  text: string;
  taskId?: string | null;
  actualMins: number | null;
  estimateMins?: number | null;
  predictedMins?: number | null;
  createdAt?: string | null;
  completedAt?: string | null;
  jobId?: string | null;
  /** When true, excluded from duration/bias learning. */
  durationContaminated?: boolean;
  outcomeKind?: 'done' | 'partial' | 'carry' | 'skip' | string | null;
};

export type ClusterBehaviourSlice = {
  clusterId: string;
  label: string;
  sampleCount: number;
  sameDayRate: number | null;
  carryRate: number | null;
  durationDispersionMins: number | null;
  consistency: number | null;
  estimationLogBias: number | null;
  highVariance: boolean;
};

export type UserBehaviourModel = {
  userId: string;
  modelVersion: string;
  calibrationSampleCount: number;
  /** Median log(actual/predicted). 0 ≈ calibrated. */
  estimationLogBias: number | null;
  underestimateRate: number | null;
  overestimateRate: number | null;
  medianAbsErrorMins: number | null;
  sameDayRate: number | null;
  sameDaySamples: number;
  carryRate: number | null;
  durationDispersionMins: number | null;
  meanCompletionAgeDays: number | null;
  clusters: ClusterBehaviourSlice[];
  carryHeavyLabels: string[];
  highVarianceLabels: string[];
  confidence: Confidence;
  updatedAt: string;
  reasons: string[];
};

const HIGH_VARIANCE_MAD_RATIO = 0.45;
const MIN_CLUSTER_SAMPLES = 2;

function toHistorySamples(samples: BehaviourSample[]): HistorySample[] {
  return samples.map((s) => ({
    text: s.text,
    actualMins:
      s.durationContaminated || s.actualMins == null || s.actualMins <= 0
        ? null
        : s.actualMins,
    createdAt: s.createdAt ?? null,
    completedAt: s.completedAt ?? null,
    jobId: s.jobId ?? null,
    taskId: s.taskId ?? null,
    durationContaminated: s.durationContaminated,
  }));
}

function calibrationPairs(samples: BehaviourSample[]): CalibrationPair[] {
  const pairs: CalibrationPair[] = [];
  for (const s of samples) {
    if (s.durationContaminated) continue;
    const actual = s.actualMins;
    const predicted =
      s.predictedMins != null && s.predictedMins > 0
        ? s.predictedMins
        : s.estimateMins != null && s.estimateMins > 0
          ? s.estimateMins
          : null;
    if (actual != null && actual > 0 && predicted != null) {
      pairs.push({ predictedMins: predicted, actualMins: actual });
    }
  }
  return pairs;
}

export function buildUserBehaviourModel(params: {
  userId: string;
  samples: BehaviourSample[];
  updatedAt: string;
  timezone?: string;
  matchThreshold?: number;
}): UserBehaviourModel {
  const timezone = params.timezone ?? 'UTC';
  const reasons: string[] = [];
  const historySamples = toHistorySamples(params.samples);
  const clusters = buildClusterModels(historySamples, {
    matchThreshold: params.matchThreshold,
    timezone,
  });

  const pairs = calibrationPairs(params.samples);
  const report = calibrateFromPairs(pairs);

  let sameDayHits = 0;
  let sameDayTotal = 0;
  let carryHits = 0;
  const ages: number[] = [];
  const allDurations: number[] = [];

  for (const s of params.samples) {
    if (s.createdAt && s.completedAt) {
      sameDayTotal++;
      if (sameLocalCalendarDay(s.createdAt, s.completedAt, timezone)) {
        sameDayHits++;
      } else {
        carryHits++;
      }
      const age = completionAgeDays(s.createdAt, s.completedAt);
      if (age != null) ages.push(age);
    }
    if (
      !s.durationContaminated &&
      s.actualMins != null &&
      s.actualMins > 0
    ) {
      allDurations.push(s.actualMins);
    }
  }

  const sameDayRate =
    sameDayTotal >= 2 ? sameDayHits / sameDayTotal : null;
  const carryRate =
    sameDayTotal >= 2 ? carryHits / sameDayTotal : null;
  const dispersion =
    allDurations.length >= 3 ? madScaled(allDurations) : null;
  const meanAge =
    ages.length > 0
      ? ages.reduce((a, b) => a + b, 0) / ages.length
      : null;

  const clusterSlices: ClusterBehaviourSlice[] = clusters.map((c) =>
    behaviourForCluster(c, params.samples, timezone)
  );

  const carryHeavyLabels = clusterSlices
    .filter(
      (s) =>
        s.carryRate != null &&
        s.carryRate >= 0.5 &&
        s.sampleCount >= MIN_CLUSTER_SAMPLES
    )
    .map((s) => s.label);

  const highVarianceLabels = clusterSlices
    .filter((s) => s.highVariance)
    .map((s) => s.label);

  if (report.medianLogRatio != null && pairs.length >= 3) {
    reasons.push(
      report.medianLogRatio > 0.05
        ? 'tends to underestimate duration'
        : report.medianLogRatio < -0.05
          ? 'tends to overestimate duration'
          : 'estimates roughly calibrated'
    );
  }
  if (carryRate != null && carryRate >= 0.4) {
    reasons.push(`carry rate ~${Math.round(carryRate * 100)}%`);
  }
  if (highVarianceLabels.length > 0) {
    reasons.push(`${highVarianceLabels.length} high-variance cluster(s)`);
  }

  let confidence: Confidence = 'low';
  if (pairs.length >= 7 && sameDayTotal >= 5) confidence = 'high';
  else if (pairs.length >= 3 || sameDayTotal >= 3) confidence = 'medium';

  return {
    userId: params.userId,
    modelVersion: MODEL_VERSION,
    calibrationSampleCount: pairs.length,
    estimationLogBias: report.medianLogRatio,
    underestimateRate: report.underestimateRate,
    overestimateRate: report.overestimateRate,
    medianAbsErrorMins: report.medianAbsErrorMins,
    sameDayRate,
    sameDaySamples: sameDayTotal,
    carryRate,
    durationDispersionMins:
      dispersion == null ? null : Math.round(dispersion),
    meanCompletionAgeDays:
      meanAge == null ? null : Math.round(meanAge * 10) / 10,
    clusters: clusterSlices,
    carryHeavyLabels,
    highVarianceLabels,
    confidence,
    updatedAt: params.updatedAt,
    reasons,
  };
}

function behaviourForCluster(
  c: ClusterModel,
  samples: BehaviourSample[],
  timezone: string
): ClusterBehaviourSlice {
  let sameDayHits = 0;
  let sameDayTotal = 0;
  const logBiases: number[] = [];

  for (const s of samples) {
    const m = matchCluster(s.text, [c]);
    if (!m) continue;
    if (s.createdAt && s.completedAt) {
      sameDayTotal++;
      if (sameLocalCalendarDay(s.createdAt, s.completedAt, timezone)) {
        sameDayHits++;
      }
    }
    if (
      !s.durationContaminated &&
      s.actualMins != null &&
      s.actualMins > 0 &&
      s.estimateMins != null &&
      s.estimateMins > 0
    ) {
      logBiases.push(Math.log(s.actualMins / s.estimateMins));
    }
  }

  const sameDayRate =
    sameDayTotal >= MIN_CLUSTER_SAMPLES
      ? sameDayHits / sameDayTotal
      : null;
  const carryRate =
    sameDayRate == null ? null : 1 - sameDayRate;

  const durations = c.durationSamples;
  const dispersion =
    durations.length >= 3 ? madScaled(durations) : null;
  const centre =
    durations.length > 0 ? median(durations) : null;
  const highVariance =
    dispersion != null &&
    centre != null &&
    centre > 0 &&
    dispersion / centre >= HIGH_VARIANCE_MAD_RATIO &&
    durations.length >= 3;

  return {
    clusterId: c.clusterId,
    label: c.label,
    sampleCount: c.sampleCount,
    sameDayRate,
    carryRate,
    durationDispersionMins:
      dispersion == null ? null : Math.round(dispersion),
    consistency: c.consistency,
    estimationLogBias:
      logBiases.length >= 2 ? median(logBiases) : null,
    highVariance,
  };
}

export function lookupClusterBehaviour(
  text: string,
  model: UserBehaviourModel
): ClusterBehaviourSlice | null {
  if (!text.trim() || model.clusters.length === 0) return null;
  const asModels: ClusterModel[] = model.clusters.map((s) => ({
    clusterId: s.clusterId,
    label: s.label,
    version: 2,
    tokens: s.label.split(/\s+/).filter(Boolean),
    tokenWeights: {},
    sampleCount: s.sampleCount,
    durationSamples: [],
    duration: null,
    sameDayRate: s.sameDayRate,
    sameDaySamples: s.sampleCount,
    consistency: s.consistency,
    coherence: null,
  }));
  const match = matchCluster(text, asModels);
  if (!match) return null;
  return (
    model.clusters.find((c) => c.clusterId === match.cluster.clusterId) ??
    null
  );
}

export function behaviourSamplesFromHistory(
  rows: Array<{
    text: string;
    actual_mins?: number | null;
    estimate_mins?: number | null;
    created_at?: string | null;
    completed_at?: string | null;
    job_id?: string | null;
    task_id?: string | null;
  }>
): BehaviourSample[] {
  return rows.map((r) => ({
    text: r.text,
    taskId: r.task_id ?? null,
    actualMins:
      typeof r.actual_mins === 'number' && r.actual_mins > 0
        ? r.actual_mins
        : null,
    estimateMins:
      typeof r.estimate_mins === 'number' && r.estimate_mins > 0
        ? r.estimate_mins
        : null,
    createdAt: r.created_at ?? null,
    completedAt: r.completed_at ?? null,
    jobId: r.job_id ?? null,
  }));
}
