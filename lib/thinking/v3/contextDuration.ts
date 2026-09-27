// lib/thinking/v3/contextDuration.ts
//
// Context-conditional duration on top of the personal model.
//
// When enough evidence exists, prefer:
//   cluster+job → cluster+place → cluster+period → cluster → user → prior
//
// Weak context evidence is never promoted. Association is not causation —
// we only report a conditional median when the slice is large enough, and
// still shrink toward the wider cluster belief.

import {
  matchCluster,
  type HistorySample,
  type ClusterModel,
  tokenSet,
  jaccard,
  CLUSTER_MATCH_THRESHOLD,
} from './clusters';
import {
  durationFromSamples,
  shrinkTowardPrior,
  consistencyScore,
} from './stats';
import type {
  Authority,
  ConfidenceProfile,
  DurationDistribution,
} from './types';
import type { PersonalModel, HierarchicalDuration } from './model';
import {
  DEFAULT_PRIOR_STRENGTH,
  lookupHierarchicalDuration,
  SYSTEM_DEFAULT_MINS,
} from './model';

/** Minimum reliable samples in a context slice before it may override. */
export const MIN_CONTEXT_SAMPLES = 3;

export type DayPeriod =
  | 'early'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'evening'
  | 'night';

export type DurationContext = {
  jobId?: string | null;
  locationText?: string | null;
  /** Local hour 0–23 when known (completion or planning time). */
  localHour?: number | null;
  period?: DayPeriod | null;
};

export type ContextDurationLevel =
  | 'cluster_job'
  | 'cluster_place'
  | 'cluster_period'
  | 'cluster'
  | 'user'
  | 'onboarding'
  | 'system';

export type ContextualDuration = Omit<HierarchicalDuration, 'level'> & {
  level: ContextDurationLevel;
  contextUsed: {
    jobId: string | null;
    placeKey: string | null;
    period: DayPeriod | null;
  };
};

function periodFromHour(hour: number | null | undefined): DayPeriod | null {
  if (hour == null || !Number.isFinite(hour)) return null;
  const h = Math.floor(hour);
  if (h < 6) return 'early';
  if (h < 10) return 'morning';
  if (h < 13) return 'midday';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

export function classifyDayPeriod(hour: number | null | undefined): DayPeriod | null {
  return periodFromHour(hour);
}

/** Normalize place text for matching (not geocoding). */
export function placeKey(locationText: string | null | undefined): string | null {
  if (!locationText) return null;
  const t = locationText
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .join(' ')
    .trim();
  return t.length > 0 ? t : null;
}

function hourFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours();
}

function confidenceFromSamples(
  sampleSize: number,
  consistency: number | null
): ConfidenceProfile {
  const sampleStrength: ConfidenceProfile['sampleStrength'] =
    sampleSize >= 7 ? 'high' : sampleSize >= 3 ? 'medium' : 'low';
  const consistencyStrength: ConfidenceProfile['consistencyStrength'] =
    consistency == null
      ? 'low'
      : consistency >= 0.75
        ? 'high'
        : consistency >= 0.5
          ? 'medium'
          : 'low';
  const overall: ConfidenceProfile['overall'] =
    sampleStrength === 'high' && consistencyStrength !== 'low'
      ? 'high'
      : sampleStrength === 'low'
        ? 'low'
        : 'medium';
  return {
    overall,
    sampleStrength,
    effectStrength: overall,
    consistencyStrength,
    recencyWeight: null,
    specificity: sampleSize >= 3 ? 0.85 : 0.4,
    contradiction: 'none',
    staleness: 'current',
  };
}

function authorityFromSamples(sampleSize: number): Authority {
  if (sampleSize >= 7) return 'strong';
  if (sampleSize >= MIN_CONTEXT_SAMPLES) return 'suggest';
  return 'observe';
}

/**
 * Samples that belong to a cluster (by Jaccard), with optional context filters.
 */
export function filterSamplesForContext(
  samples: HistorySample[],
  cluster: ClusterModel,
  ctx: DurationContext,
  mode: 'job' | 'place' | 'period' | 'cluster'
): number[] {
  const clusterTokens = new Set(cluster.tokens);
  const targetPlace = placeKey(ctx.locationText);
  const targetPeriod =
    ctx.period ?? periodFromHour(ctx.localHour ?? null);

  const out: number[] = [];
  for (const s of samples) {
    if (s.actualMins == null || s.actualMins <= 0) continue;
    const score = jaccard(tokenSet(s.text), clusterTokens);
    if (score < CLUSTER_MATCH_THRESHOLD) continue;

    if (mode === 'job') {
      if (!ctx.jobId || s.jobId !== ctx.jobId) continue;
    } else if (mode === 'place') {
      const pk = placeKey(s.locationText);
      if (!targetPlace || !pk || pk !== targetPlace) continue;
    } else if (mode === 'period') {
      if (!targetPeriod) continue;
      const ph = periodFromHour(hourFromIso(s.completedAt ?? s.createdAt));
      if (ph !== targetPeriod) continue;
    }
    out.push(s.actualMins);
  }
  return out;
}

function trySlice(
  samples: number[],
  widerExpected: number,
  priorStrength: number,
  level: ContextDurationLevel,
  reasons: string[],
  cluster: ClusterModel,
  matchScore: number,
  contextUsed: ContextualDuration['contextUsed']
): ContextualDuration | null {
  if (samples.length < MIN_CONTEXT_SAMPLES) return null;
  const dist = durationFromSamples(samples, 'median');
  if (!dist) return null;

  let expected = dist.expectedMins;
  let method: DurationDistribution['method'] = dist.method;
  if (samples.length < 5) {
    expected = Math.round(
      shrinkTowardPrior(expected, widerExpected, samples.length, priorStrength)
    );
    method = 'blended';
    reasons.push(
      `${level} n=${samples.length}; shrunk toward cluster/user`
    );
  } else {
    reasons.push(`${level} n=${samples.length}`);
  }

  const consistency = consistencyScore(samples);
  return {
    distribution: {
      expectedMins: expected,
      interval: dist.interval,
      sampleSize: samples.length,
      method,
    },
    level,
    clusterId: cluster.clusterId,
    clusterLabel: cluster.label,
    matchScore,
    authority: authorityFromSamples(samples.length),
    confidence: confidenceFromSamples(samples.length, consistency),
    reasons,
    contextUsed,
  };
}

/**
 * Context-aware duration lookup.
 * Requires history samples to filter context slices.
 * Falls back to hierarchical duration when context evidence is weak.
 */
export function lookupContextualDuration(
  text: string,
  model: PersonalModel,
  samples: HistorySample[],
  ctx: DurationContext = {},
  opts?: { priorStrength?: number }
): ContextualDuration {
  const priorStrength = opts?.priorStrength ?? DEFAULT_PRIOR_STRENGTH;
  const base = lookupHierarchicalDuration(text, model, { priorStrength });
  const widerExpected =
    base.distribution.expectedMins ||
    model.personalMedianMins ||
    model.state.priors.softFloorMins ||
    SYSTEM_DEFAULT_MINS;

  const match = matchCluster(text, model.clusters, model.matchThreshold);
  const contextUsed = {
    jobId: ctx.jobId ?? null,
    placeKey: placeKey(ctx.locationText),
    period: ctx.period ?? periodFromHour(ctx.localHour ?? null),
  };

  if (match && match.cluster.durationSamples.length > 0) {
    const c = match.cluster;

    if (ctx.jobId) {
      const jobSamples = filterSamplesForContext(samples, c, ctx, 'job');
      const hit = trySlice(
        jobSamples,
        widerExpected,
        priorStrength,
        'cluster_job',
        [],
        c,
        match.score,
        contextUsed
      );
      if (hit) return hit;
    }

    if (contextUsed.placeKey) {
      const placeSamples = filterSamplesForContext(samples, c, ctx, 'place');
      const hit = trySlice(
        placeSamples,
        widerExpected,
        priorStrength,
        'cluster_place',
        [],
        c,
        match.score,
        contextUsed
      );
      if (hit) return hit;
    }

    if (contextUsed.period) {
      const periodSamples = filterSamplesForContext(samples, c, ctx, 'period');
      const hit = trySlice(
        periodSamples,
        widerExpected,
        priorStrength,
        'cluster_period',
        [],
        c,
        match.score,
        contextUsed
      );
      if (hit) return hit;
    }
  }

  return {
    ...base,
    level: base.level,
    contextUsed,
    reasons: [
      ...base.reasons,
      'context evidence insufficient or absent — used hierarchical duration',
    ],
  };
}
