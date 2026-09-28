/**
 * FP-1 — Multi-channel belief vector.
 *
 * Duration is one channel. Carry, same-day, fragility, and sample quality
 * are first-class so fit can read more than minutes.
 *
 * Pure. Deterministic. Built from ordinary history + optional outcome kinds.
 */

import {
  buildClusterModels,
  matchCluster,
  type HistorySample,
  type ClusterModel,
} from './clusters';
import { median, madScaled } from './stats';
import {
  authorityFromCleanN,
  type BeliefAuthority,
} from './learningRates';
import type { Confidence } from './types';
import { MODEL_VERSION } from './types';

export type MultiChannelBelief = {
  key: string;
  label: string;
  clusterId: string | null;
  durationMins: number | null;
  durationSpreadMins: number | null;
  sameDayRate: number | null;
  carryHazard: number | null;
  fragility: number | null;
  sampleQuality: number;
  cleanSampleCount: number;
  totalSampleCount: number;
  sameDaySamples: number;
  authority: BeliefAuthority;
  confidence: Confidence;
  reasons: string[];
};

export type MultiChannelModel = {
  userId: string;
  modelVersion: string;
  global: MultiChannelBelief;
  clusters: MultiChannelBelief[];
  updatedAt: string;
};

export type BeliefBuildSample = {
  text: string;
  actualMins?: number | null;
  createdAt?: string | null;
  completedAt?: string | null;
  jobId?: string | null;
  outcomeChannel?:
    | 'clean_done'
    | 'partial'
    | 'carry'
    | 'interrupted'
    | 'blocked'
    | 'skip'
    | 'unknown'
    | string
    | null;
  outcomeKind?: string | null;
};

function sameCalendarDay(a: string | null, b: string | null): boolean | null {
  if (!a || !b) return null;
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function isCleanDuration(s: BeliefBuildSample): boolean {
  const ch = s.outcomeChannel;
  if (
    ch === 'partial' ||
    ch === 'carry' ||
    ch === 'interrupted' ||
    ch === 'blocked' ||
    ch === 'skip'
  ) {
    return false;
  }
  if (
    s.outcomeKind === 'partial' ||
    s.outcomeKind === 'carry' ||
    s.outcomeKind === 'skip'
  ) {
    return false;
  }
  const m = s.actualMins;
  return typeof m === 'number' && Number.isFinite(m) && m > 0;
}

function isCarryLike(s: BeliefBuildSample): boolean {
  return (
    s.outcomeChannel === 'carry' ||
    s.outcomeKind === 'carry' ||
    s.outcomeKind === 'carried'
  );
}

function isFragile(s: BeliefBuildSample): boolean {
  return (
    s.outcomeChannel === 'interrupted' ||
    s.outcomeChannel === 'blocked' ||
    s.outcomeKind === 'interrupted'
  );
}

function beliefFromSamples(
  key: string,
  label: string,
  clusterId: string | null,
  samples: BeliefBuildSample[]
): MultiChannelBelief {
  const total = samples.length;
  const clean = samples.filter(isCleanDuration);
  const cleanMins = clean
    .map((s) => s.actualMins as number)
    .filter((m) => m > 0);
  const durationMins =
    cleanMins.length > 0 ? Math.round(median(cleanMins)) : null;
  const durationSpreadMins =
    cleanMins.length >= 3 ? madScaled(cleanMins) : null;

  let sameDayHits = 0;
  let sameDayTotal = 0;
  for (const s of samples) {
    const same = sameCalendarDay(s.createdAt ?? null, s.completedAt ?? null);
    if (same == null) continue;
    sameDayTotal += 1;
    if (same) sameDayHits += 1;
  }
  const sameDayRate =
    sameDayTotal >= 2 ? sameDayHits / sameDayTotal : null;

  let carryHits = 0;
  let carryDenom = 0;
  let fragileHits = 0;
  let channelDenom = 0;
  for (const s of samples) {
    if (s.outcomeChannel || s.outcomeKind) {
      channelDenom += 1;
      if (isCarryLike(s)) carryHits += 1;
      carryDenom += 1;
      if (isFragile(s)) fragileHits += 1;
    } else {
      const same = sameCalendarDay(s.createdAt ?? null, s.completedAt ?? null);
      if (same === false) {
        carryHits += 1;
        carryDenom += 1;
      } else if (same === true) {
        carryDenom += 1;
      }
    }
  }

  const carryHazard =
    carryDenom >= 2 ? Math.min(1, carryHits / carryDenom) : null;
  const fragility =
    channelDenom >= 2 ? fragileHits / channelDenom : null;

  const cleanN = cleanMins.length;
  const sampleQuality = total > 0 ? cleanN / total : 0;
  const authority = authorityFromCleanN(cleanN);
  const confidence: Confidence =
    cleanN >= 7 &&
    (durationSpreadMins == null ||
      durationSpreadMins < (durationMins ?? 30) * 0.5)
      ? 'high'
      : cleanN >= 3
        ? 'medium'
        : 'low';

  const reasons: string[] = [];
  if (cleanN > 0) reasons.push(`clean duration n=${cleanN}`);
  if (carryHazard != null && carryHazard >= 0.4) {
    reasons.push(`carry hazard ~${Math.round(carryHazard * 100)}%`);
  }
  if (fragility != null && fragility > 0) {
    reasons.push(`fragility ~${Math.round(fragility * 100)}%`);
  }
  reasons.push(`authority=${authority}`);

  return {
    key,
    label,
    clusterId,
    durationMins,
    durationSpreadMins,
    sameDayRate,
    carryHazard,
    fragility,
    sampleQuality,
    cleanSampleCount: cleanN,
    totalSampleCount: total,
    sameDaySamples: sameDayTotal,
    authority,
    confidence,
    reasons,
  };
}

function toHistorySamples(samples: BeliefBuildSample[]): HistorySample[] {
  return samples.map((s) => ({
    text: s.text,
    actualMins: isCleanDuration(s) ? (s.actualMins as number) : null,
    createdAt: s.createdAt ?? null,
    completedAt: s.completedAt ?? null,
    jobId: s.jobId ?? null,
  }));
}

export function buildMultiChannelModel(params: {
  userId: string;
  samples: BeliefBuildSample[];
  updatedAt?: string;
}): MultiChannelModel {
  const updatedAt = params.updatedAt ?? new Date().toISOString();
  const history = toHistorySamples(params.samples);
  const clusterModels = buildClusterModels(history);

  const refined: MultiChannelBelief[] = clusterModels.map((c) => {
    const members = params.samples.filter((s) => {
      const m = matchCluster(s.text, clusterModels);
      return m != null && m.cluster.clusterId === c.clusterId;
    });
    return beliefFromSamples(
      c.clusterId,
      c.label || 'cluster',
      c.clusterId,
      members
    );
  });

  const global = beliefFromSamples('global', 'all work', null, params.samples);

  return {
    userId: params.userId,
    modelVersion: MODEL_VERSION,
    global,
    clusters: refined,
    updatedAt,
  };
}

export function lookupMultiChannelBelief(
  text: string,
  model: MultiChannelModel,
  clusterModels?: ClusterModel[]
): MultiChannelBelief {
  const trimmed = text.trim();
  if (!trimmed || model.clusters.length === 0) return model.global;

  if (!clusterModels) {
    return model.global;
  }
  const match = matchCluster(trimmed, clusterModels);
  if (!match) return model.global;
  return (
    model.clusters.find((c) => c.clusterId === match.cluster.clusterId) ??
    model.global
  );
}

export function beliefSamplesFromHistory(
  rows: Array<{
    text: string;
    actual_mins?: number | null;
    created_at?: string | null;
    completed_at?: string | null;
    job_id?: string | null;
    outcome_kind?: string | null;
    outcome_channel?: string | null;
  }>
): BeliefBuildSample[] {
  return rows.map((r) => ({
    text: r.text,
    actualMins:
      typeof r.actual_mins === 'number' && r.actual_mins > 0
        ? r.actual_mins
        : null,
    createdAt: r.created_at ?? null,
    completedAt: r.completed_at ?? null,
    jobId: r.job_id ?? null,
    outcomeKind: r.outcome_kind ?? null,
    outcomeChannel: r.outcome_channel ?? null,
  }));
}
