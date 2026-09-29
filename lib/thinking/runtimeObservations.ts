/**
 * Runtime observations — one shared slice of history for daily decisions.
 *
 * Capture (duration chip), capacity (dayFit), and Jobs remaining should all
 * read the same match: duration, same-day behaviour, place, and label.
 *
 * Phase 6–7: UserBehaviourModel + PersonalModel (hierarchical duration)
 * built once per history load — not per-task.
 *
 * Pure and deterministic. Never invents jobs or places.
 */

import {
  buildClusters,
  suggestEstimate,
  type HistoricalTask,
  type TaskCluster,
  type EstimateSuggestion,
  type ClusterLocation,
} from '@/lib/taskIntelligence';
import { isReliableActualMins } from '@/lib/thinking/durationQuality';
import {
  buildUserBehaviourModel,
  behaviourSamplesFromHistory,
  lookupClusterBehaviour,
  type UserBehaviourModel,
  type ClusterBehaviourSlice,
} from '@/lib/thinking/v3/behaviour';
import {
  buildPersonalModel,
  lookupHierarchicalDuration,
  historySampleFromRow,
  type PersonalModel,
  type HierarchicalDuration,
} from '@/lib/thinking/v3/model';
import {
  buildWorkLeaves,
  matchWorkLeaf,
  type WorkLeaf,
} from '@/lib/thinking/v3/workIdentity';
import { durationFromSamples } from '@/lib/thinking/v3/stats';
import { priorStrengthForCleanN, authorityFromCleanN } from '@/lib/thinking/v3/learningRates';
import { shrinkTowardPrior } from '@/lib/thinking/v3/stats';

const MATCH_THRESHOLD = 0.4;
const MIN_BEHAVIOUR_SAMPLES = 2;
/** Cap history fed into behaviour + clusters for runtime cost. */
const RUNTIME_HISTORY_CAP = 200;

export type ClusterBehaviour = {
  sameDayRate: number;
  samples: number;
};

export type RuntimeObservations = {
  history: HistoricalTask[];
  clusters: TaskCluster[];
  personalMedian: number | null;
  behaviourByLabel: Record<string, ClusterBehaviour>;
  softFloorMins: number;
  /** Scales lean on learned duration (from calibration). */
  blendScale: number;
  calibrationExplain: string | null;
  anchorSameDayRate: number;
  flexibleSameDayRate: number;
  /** Phase 6 — estimation bias, carry patterns, variance. */
  behaviour: UserBehaviourModel | null;
  /** Phase 7 — hierarchical duration model (built once). */
  personalModel: PersonalModel | null;
  /** S1 — work identity leaves (job/place/fingerprint aggregation). */
  workLeaves: WorkLeaf[];
};

export type TaskSignals = {
  estimate: EstimateSuggestion | null;
  sameDayRate: number | null;
  sameDaySamples: number;
  location: ClusterLocation | null;
  matchedLabel: string | null;
  explainDuration: string | null;
  explainBehaviour: string | null;
  /** Phase 6 cluster behaviour slice when matched. */
  clusterBehaviour: ClusterBehaviourSlice | null;
  /** Soft capacity scale from estimation bias (1 = neutral). */
  capacityBiasScale: number;
  /** Phase 7 hierarchical duration belief. */
  hierarchicalDuration: HierarchicalDuration | null;
  /** S1 matched work identity leaf. */
  workLeaf: WorkLeaf | null;
  workKey: string | null;
};

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function sameCalendarDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function findBestCluster(
  inputTokens: Set<string>,
  clusters: TaskCluster[]
): { cluster: TaskCluster; score: number } | null {
  let best: TaskCluster | null = null;
  let bestScore = 0;
  for (const c of clusters) {
    const score = jaccard(inputTokens, c.tokens);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best || bestScore < MATCH_THRESHOLD) return null;
  return { cluster: best, score: bestScore };
}

function personalMedianActual(history: HistoricalTask[]): number | null {
  const vals = history
    .map((h) => h.actual_mins)
    .filter((m): m is number => isReliableActualMins(m))
    .sort((a, b) => a - b);
  if (vals.length === 0) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 === 0
    ? Math.round((vals[mid - 1] + vals[mid]) / 2)
    : vals[mid];
}

/**
 * Dampened capacity scale from log-bias.
 * Positive bias (actual > estimate) → scale > 1 so the day plans more honestly.
 */
export function capacityBiasScaleFromBehaviour(
  behaviour: UserBehaviourModel | null,
  text: string
): number {
  if (!behaviour || behaviour.calibrationSampleCount < 3) return 1;
  const slice = lookupClusterBehaviour(text, behaviour);
  const logBias =
    slice?.estimationLogBias ?? behaviour.estimationLogBias;
  if (logBias == null || !Number.isFinite(logBias)) return 1;
  const scale = Math.exp(logBias * 0.5);
  return Math.min(1.45, Math.max(0.75, scale));
}

export function buildRuntimeObservations(
  history: HistoricalTask[],
  options?: {
    softFloorMins?: number;
    blendScale?: number;
    calibrationExplain?: string | null;
    anchorSameDayRate?: number;
    flexibleSameDayRate?: number;
    userId?: string;
    updatedAt?: string;
    timezone?: string;
  }
): RuntimeObservations {
  const capped =
    history.length > RUNTIME_HISTORY_CAP
      ? history.slice(0, RUNTIME_HISTORY_CAP)
      : history;

  const clusters = buildClusters(capped);
  const behaviourByLabel: Record<string, ClusterBehaviour> = {};

  for (const cluster of clusters) {
    let matched = 0;
    let sameDay = 0;
    for (const h of capped) {
      const score = jaccard(cluster.tokens, tokenize(h.text));
      if (score < MATCH_THRESHOLD) continue;
      if (!(h.created_at && h.completed_at)) continue;
      matched++;
      if (sameCalendarDay(h.created_at, h.completed_at)) sameDay++;
    }
    if (matched >= MIN_BEHAVIOUR_SAMPLES) {
      behaviourByLabel[cluster.label] = {
        sameDayRate: sameDay / matched,
        samples: matched,
      };
    }
  }

  const updatedAt = options?.updatedAt ?? '1970-01-01T00:00:00.000Z';
  const userId = options?.userId ?? 'runtime';

  let behaviour: UserBehaviourModel | null = null;
  if (capped.length >= 2) {
    const samples = behaviourSamplesFromHistory(
      capped.map((h) => ({
        text: h.text,
        actual_mins: h.actual_mins,
        estimate_mins: h.estimate_mins,
        created_at: h.created_at,
        completed_at: h.completed_at,
        job_id: h.job_id,
      }))
    );
    behaviour = buildUserBehaviourModel({
      userId,
      samples,
      updatedAt,
      timezone: options?.timezone,
    });
  }

  let personalModel: PersonalModel | null = null;
  if (capped.length >= 1) {
    const samples = capped.map((h) =>
      historySampleFromRow({
        text: h.text,
        actual_mins: h.actual_mins,
        created_at: h.created_at,
        completed_at: h.completed_at,
        job_id: h.job_id,
        location_text: h.location_text,
      })
    );
    personalModel = buildPersonalModel({
      userId,
      samples,
      priors: {
        softFloorMins: options?.softFloorMins ?? 30,
        anchorSameDayRate: options?.anchorSameDayRate ?? 0.55,
        flexibleSameDayRate: options?.flexibleSameDayRate ?? 0.4,
        blendScale: options?.blendScale ?? 1,
      },
      updatedAt,
    });
  }

  // S1 — work identity leaves for duration aggregation beyond text clusters.
  const workLeaves = buildWorkLeaves(
    capped.map((h) => ({
      text: h.text,
      actualMins: h.actual_mins,
      completedAt: h.completed_at ?? null,
      createdAt: h.created_at ?? null,
      jobId: h.job_id ?? null,
      locationText: h.location_text ?? null,
      subtaskCount: h.subtask_count ?? null,
      estimateMins: h.estimate_mins ?? null,
    }))
  );

  let anchorSameDayRate = options?.anchorSameDayRate ?? 0.55;
  let flexibleSameDayRate = options?.flexibleSameDayRate ?? 0.4;
  if (
    behaviour &&
    behaviour.sameDaySamples >= 5 &&
    behaviour.sameDayRate != null
  ) {
    const r = behaviour.sameDayRate;
    anchorSameDayRate = Math.min(0.75, Math.max(0.5, r + 0.1));
    flexibleSameDayRate = Math.max(0.25, Math.min(0.45, r - 0.15));
  }

  let blendScale = options?.blendScale ?? 1;
  if (
    behaviour &&
    behaviour.calibrationSampleCount >= 4 &&
    behaviour.estimationLogBias != null &&
    behaviour.estimationLogBias > 0.08
  ) {
    blendScale = Math.min(1.25, blendScale * 1.1);
  }

  return {
    history: capped,
    clusters,
    personalMedian: personalMedianActual(capped),
    behaviourByLabel,
    softFloorMins: options?.softFloorMins ?? 30,
    blendScale,
    calibrationExplain: options?.calibrationExplain ?? null,
    anchorSameDayRate,
    flexibleSameDayRate,
    behaviour,
    personalModel,
    workLeaves,
  };
}

export function lookupTaskSignals(
  text: string,
  runtime: RuntimeObservations,
  context?: { jobId?: string | null; locationText?: string | null }
): TaskSignals {
  const empty: TaskSignals = {
    estimate: null,
    sameDayRate: null,
    sameDaySamples: 0,
    location: null,
    matchedLabel: null,
    explainDuration: null,
    explainBehaviour: null,
    clusterBehaviour: null,
    capacityBiasScale: 1,
    hierarchicalDuration: null,
    workLeaf: null,
    workKey: null,
  };

  const trimmed = text.trim();
  if (trimmed.length === 0) return empty;

  const estimate = suggestEstimate(trimmed, runtime.history, runtime.clusters);
  const match = findBestCluster(tokenize(trimmed), runtime.clusters);
  const matchedLabel = match?.cluster.label ?? estimate?.matchedLabel ?? null;
  const location = match?.cluster.location ?? null;

  let sameDayRate: number | null = null;
  let sameDaySamples = 0;
  if (matchedLabel && runtime.behaviourByLabel[matchedLabel]) {
    const b = runtime.behaviourByLabel[matchedLabel];
    sameDayRate = b.sameDayRate;
    sameDaySamples = b.samples;
  }

  const clusterBehaviour = runtime.behaviour
    ? lookupClusterBehaviour(trimmed, runtime.behaviour)
    : null;

  if (
    clusterBehaviour &&
    clusterBehaviour.sameDayRate != null &&
    clusterBehaviour.sampleCount >= MIN_BEHAVIOUR_SAMPLES
  ) {
    if (
      sameDaySamples < clusterBehaviour.sampleCount ||
      sameDayRate == null
    ) {
      sameDayRate = clusterBehaviour.sameDayRate;
      sameDaySamples = clusterBehaviour.sampleCount;
    }
  }

  let hierarchicalDuration = runtime.personalModel
    ? lookupHierarchicalDuration(trimmed, runtime.personalModel)
    : null;

  // S1: prefer work identity leaf duration when clean-n is sufficient.
  let workLeaf: WorkLeaf | null = null;
  let workKey: string | null = null;
  const workHit =
    runtime.workLeaves.length > 0
      ? matchWorkLeaf(
          {
            text: trimmed,
            jobId: context?.jobId ?? null,
            locationText: context?.locationText ?? null,
          },
          runtime.workLeaves
        )
      : null;
  if (workHit && workHit.leaf.cleanDurationMins.length >= 2) {
    workLeaf = workHit.leaf;
    workKey = workHit.workKey;
    const mins = workLeaf.cleanDurationMins;
    const n = mins.length;
    const dist = durationFromSamples(mins, 'median');
    if (dist) {
      const strength = priorStrengthForCleanN(n);
      let expected = dist.expectedMins;
      if (n < 4) {
        expected = Math.round(
          shrinkTowardPrior(expected, runtime.softFloorMins, n, strength)
        );
      }
      const authBand = authorityFromCleanN(n);
      hierarchicalDuration = {
        distribution: {
          expectedMins: expected,
          interval: dist.interval,
          sampleSize: n,
          method: n < 4 ? 'blended' : dist.method,
        },
        level: 'cluster',
        clusterId: workKey,
        clusterLabel:
          workLeaf.parts.lexicalFingerprint.replace(/\|/g, ' ').trim() ||
          'this kind of work',
        matchScore: 1,
        authority:
          authBand === 'established'
            ? 'strong'
            : authBand === 'forming'
              ? 'suggest'
              : 'observe',
        confidence: {
          overall:
            authBand === 'established'
              ? 'high'
              : authBand === 'forming'
                ? 'medium'
                : 'low',
          sampleStrength:
            n >= 7 ? 'high' : n >= 3 ? 'medium' : 'low',
          effectStrength:
            authBand === 'established'
              ? 'high'
              : authBand === 'forming'
                ? 'medium'
                : 'low',
          consistencyStrength: 'medium',
          recencyWeight: null,
          specificity: workLeaf.parts.jobId ? 0.85 : 0.55,
          contradiction: 'none',
          staleness: 'current',
        },
        reasons: [
          `work identity n=${n}`,
          workLeaf.parts.jobId ? 'job-scoped' : 'work-scoped',
        ],
      };
    }
  }

  let explainDuration: string | null = null;
  const hdDist = hierarchicalDuration?.distribution ?? null;
  if (workLeaf && hierarchicalDuration && hdDist && (hdDist.sampleSize ?? 0) > 0) {
    const m = hdDist.expectedMins;
    const n = hdDist.sampleSize;
    explainDuration = `≈ ${m}m — ${n} on this work`;
  } else if (hierarchicalDuration && hdDist && (hdDist.sampleSize ?? 0) > 0) {
    const m = hdDist.expectedMins;
    const n = hdDist.sampleSize;
    if (hierarchicalDuration.level === 'cluster') {
      explainDuration = `≈ ${m}m — ${n} similar (${hierarchicalDuration.clusterLabel ?? 'cluster'})`;
    } else if (hierarchicalDuration.level === 'user') {
      explainDuration = `≈ ${m}m typical for you`;
    }
  }
  if (!explainDuration && estimate) {
    if (estimate.source === 'lifecycle') {
      explainDuration = `≈ ${estimate.suggestedMins}m — from how this work usually behaves`;
    } else if (estimate.source === 'mixed') {
      explainDuration = `≈ ${estimate.suggestedMins}m — timed samples + how it behaves`;
    } else {
      explainDuration = `≈ ${estimate.suggestedMins}m — ${estimate.sampleCount} similar`;
    }
  } else if (!explainDuration && runtime.personalMedian != null) {
    explainDuration = `≈ ${runtime.personalMedian}m typical for you`;
  }

  let explainBehaviour: string | null = null;
  if (sameDayRate != null && sameDaySamples >= MIN_BEHAVIOUR_SAMPLES) {
    if (sameDayRate >= runtime.anchorSameDayRate) {
      explainBehaviour = `Usually finished same day (${Math.round(sameDayRate * 100)}%)`;
    } else if (sameDayRate < runtime.flexibleSameDayRate) {
      explainBehaviour = `Often moves forward (${Math.round((1 - sameDayRate) * 100)}% carried)`;
    }
  }

  const capacityBiasScale = capacityBiasScaleFromBehaviour(
    runtime.behaviour,
    trimmed
  );

  return {
    estimate,
    sameDayRate,
    sameDaySamples,
    location,
    matchedLabel,
    explainDuration,
    explainBehaviour,
    clusterBehaviour,
    capacityBiasScale,
    hierarchicalDuration,
    workLeaf,
    workKey,
  };
}
