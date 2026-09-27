// lib/thinking/v3/adapters.ts
//
// Bridge existing V1/V2 shapes into canonical V3 contracts.
// Runtime paths stay on V1 until deliberately switched.
// Adapters are pure and side-effect free.

import type { CompletedTaskFacts, PredictionLogEntry, Confidence } from '../types';
import type { HistoricalTask } from '@/lib/taskIntelligence';
import type {
  TaskFact,
  ContextSnapshot,
  Prediction,
  Outcome,
  ConfidenceProfile,
  Evidence,
  DurationDistribution,
} from './types';
import {
  MODEL_VERSION,
  ALGORITHM_VERSION,
  FEATURE_VERSION,
} from './types';
import {
  durationFromSamples as _durationFromSamples,
  shrinkTowardPrior,
} from './stats';

export function confidenceProfileFromV1(
  confidence: Confidence,
  opts?: {
    sampleSize?: number;
    contradiction?: ConfidenceProfile['contradiction'];
    staleness?: ConfidenceProfile['staleness'];
    recencyWeight?: number | null;
    specificity?: number | null;
  }
): ConfidenceProfile {
  const sampleStrength =
    opts?.sampleSize != null
      ? opts.sampleSize >= 7
        ? 'high'
        : opts.sampleSize >= 4
          ? 'medium'
          : 'low'
      : confidence;

  return {
    overall: confidence,
    sampleStrength,
    effectStrength: confidence,
    consistencyStrength: confidence,
    recencyWeight: opts?.recencyWeight ?? null,
    specificity: opts?.specificity ?? null,
    contradiction: opts?.contradiction ?? 'none',
    staleness: opts?.staleness ?? 'current',
  };
}

export function emptyContextSnapshot(at: string, timezone = 'UTC'): ContextSnapshot {
  return {
    at,
    timezone,
    temporal: {
      localDate: null,
      localHour: null,
      dayOfWeek: null,
      period: null,
      isWorkday: null,
    },
    spatial: {
      locationText: null,
      lat: null,
      lng: null,
      placeId: null,
    },
    work: {
      jobId: null,
      folderId: null,
      projectLabel: null,
    },
    calendar: {
      remainingWindowMins: null,
      meetingDensity: null,
      hasTravelBlock: null,
    },
    lifecycle: {
      taskAgeDays: null,
      carryCount: null,
      previousPartials: null,
    },
    sequence: {
      previousTaskId: null,
      previousClusterLabel: null,
      nextCommitmentAt: null,
    },
  };
}

export function taskFactFromCompleted(
  facts: CompletedTaskFacts,
  params: {
    taskId: string;
    userId: string;
    clusterLabel?: string | null;
    clusterId?: string | null;
    novel?: boolean | null;
    carryCount?: number | null;
  }
): TaskFact {
  return {
    taskId: params.taskId,
    userId: params.userId,
    text: facts.text,
    clusterLabel: params.clusterLabel ?? null,
    clusterId: params.clusterId ?? null,
    clusterVersion: null,
    jobId: facts.job_id,
    locationText: facts.location_text,
    lat: facts.lat,
    lng: facts.lng,
    typedEstimateMins: facts.estimate_mins > 0 ? facts.estimate_mins : null,
    observedMins: facts.actual_mins,
    loggedMins: facts.logged_mins,
    remainingMins: null,
    status: 'done',
    source: facts.source,
    createdAt: facts.created_at,
    startedAt: facts.started_at,
    completedAt: facts.completed_at,
    surfaceDate: facts.surface_date,
    intendedTime: null,
    dueToday: null,
    subtaskCount: facts.subtaskCount,
    subtaskDoneCount: facts.subtaskDoneCount,
    subtaskTotalMins: facts.subtaskTotalMins,
    carryCount: params.carryCount ?? null,
    novel: params.novel ?? null,
  };
}

export function taskFactFromHistorical(
  h: HistoricalTask,
  params: {
    taskId: string;
    userId: string;
    clusterLabel?: string | null;
  }
): TaskFact {
  const reliable =
    typeof h.actual_mins === 'number' && h.actual_mins > 0;
  return {
    taskId: params.taskId,
    userId: params.userId,
    text: h.text,
    clusterLabel: params.clusterLabel ?? null,
    clusterId: null,
    clusterVersion: null,
    jobId: h.job_id ?? null,
    locationText: h.location_text ?? null,
    lat: h.lat ?? null,
    lng: h.lng ?? null,
    typedEstimateMins:
      h.estimate_mins != null && h.estimate_mins > 0 ? h.estimate_mins : null,
    observedMins: reliable ? h.actual_mins : null,
    loggedMins: h.logged_mins ?? (reliable ? h.actual_mins : 0),
    remainingMins: null,
    status: 'done',
    source: (h.source as TaskFact['source']) ?? 'planned',
    createdAt: h.created_at || '',
    startedAt: null,
    completedAt: h.completed_at ?? null,
    surfaceDate: h.surface_date ?? null,
    intendedTime: h.intended_time ?? null,
    dueToday: h.due_today ?? null,
    subtaskCount: h.subtask_count ?? 0,
    subtaskDoneCount: 0,
    subtaskTotalMins: 0,
    carryCount: null,
    novel: null,
  };
}

export function predictionFromLogEntry(
  entry: PredictionLogEntry,
  params?: {
    predictionId?: string;
    taskId?: string | null;
    context?: ContextSnapshot;
  }
): Prediction {
  const createdAt = entry.logged_at || new Date().toISOString();
  const conf = confidenceProfileFromV1(entry.confidence, {
    sampleSize: entry.cluster_count,
  });

  const suggested = entry.suggested_mins;
  const typed = entry.estimated_mins > 0 ? entry.estimated_mins : null;

  return {
    predictionId: params?.predictionId ?? entry.id ?? `legacy-${createdAt}`,
    taskId: params?.taskId ?? entry.task_id ?? null,
    userId: entry.user_id,
    kind: 'duration',
    predicted: {
      value: suggested,
      interval: null,
    },
    confidence: conf,
    authority: conf.overall === 'high' ? 'suggest' : 'observe',
    typedEstimateMins: typed,
    planningEstimateMins: suggested ?? typed,
    context: params?.context ?? emptyContextSnapshot(createdAt),
    evidenceIds: [],
    decisionId: null,
    modelVersion: entry.model_version ?? '1.x-legacy',
    algorithmVersion: entry.algorithm_version ?? '1.x-legacy',
    featureVersion: entry.feature_version ?? '1.x-legacy',
    createdAt,
    outcomeId: entry.actual_mins != null ? `outcome-from-${entry.id ?? createdAt}` : null,
    resolvedAt: entry.completed_at,
  };
}

export function outcomeFromCompletion(params: {
  outcomeId: string;
  predictionId: string | null;
  taskId: string;
  userId: string;
  kind?: Outcome['kind'];
  measuredMins: number | null;
  trainMins: number | null;
  trainSource: Outcome['trainSource'];
  remainingMins?: number | null;
  predictedMins?: number | null;
  context?: ContextSnapshot | null;
  createdAt?: string;
}): Outcome {
  const measured = params.measuredMins;
  const predicted = params.predictedMins;
  let error: Outcome['error'] = null;
  if (measured != null && predicted != null && predicted > 0) {
    const signed = measured - predicted;
    error = {
      signedMins: signed,
      absoluteMins: Math.abs(signed),
      relative: signed / predicted,
    };
  }

  return {
    outcomeId: params.outcomeId,
    predictionId: params.predictionId,
    taskId: params.taskId,
    userId: params.userId,
    kind: params.kind ?? 'done',
    measuredMins: measured,
    trainMins: params.trainMins,
    remainingMins: params.remainingMins ?? null,
    trainSource: params.trainSource,
    error,
    context: params.context ?? null,
    createdAt: params.createdAt ?? new Date().toISOString(),
  };
}

export function pointDistribution(
  mins: number,
  method: DurationDistribution['method'],
  sampleSize = 0
): DurationDistribution {
  const spread =
    method === 'prior' || sampleSize < 2
      ? Math.max(10, Math.round(mins * 0.25))
      : Math.max(5, Math.round(mins * 0.15));
  return {
    expectedMins: Math.round(mins),
    interval: {
      low: Math.max(1, Math.round(mins - spread)),
      high: Math.round(mins + spread),
    },
    sampleSize,
    method,
  };
}

/**
 * Robust duration belief from samples (Phase 3).
 * Optional shrink toward prior when sample is small.
 */
export function durationBeliefFromSamples(
  values: number[],
  opts?: {
    method?: 'median' | 'trimmed_mean' | 'weighted_median';
    priorMins?: number;
    priorStrength?: number;
  }
): DurationDistribution | null {
  const method = opts?.method ?? 'median';
  const dist = _durationFromSamples(values, method);
  if (!dist) return null;
  if (opts?.priorMins != null && dist.sampleSize < 8) {
    const shrunk = shrinkTowardPrior(
      dist.expectedMins,
      opts.priorMins,
      dist.sampleSize,
      opts.priorStrength ?? 3
    );
    return {
      ...dist,
      expectedMins: Math.round(shrunk),
      method: 'blended',
    };
  }
  return dist;
}

export function minimalEvidence(params: {
  evidenceId: string;
  label: string;
  sampleSize: number;
  kind?: Evidence['kind'];
  sourceRefs?: string[];
  createdAt?: string;
}): Evidence {
  return {
    evidenceId: params.evidenceId,
    kind: params.kind ?? 'observation',
    label: params.label,
    sampleSize: params.sampleSize,
    effectMagnitude: null,
    consistency: null,
    variance: null,
    recencyDays: null,
    specificity: null,
    contradictionCount: 0,
    missingDataCount: 0,
    insufficient: params.sampleSize === 0,
    sourceRefs: params.sourceRefs ?? [],
    measurements: [],
    createdAt: params.createdAt ?? new Date().toISOString(),
  };
}

export function currentVersions() {
  return {
    modelVersion: MODEL_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    featureVersion: FEATURE_VERSION,
  };
}
