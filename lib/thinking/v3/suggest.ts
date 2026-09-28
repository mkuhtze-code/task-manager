// lib/thinking/v3/suggest.ts
//
// Phase 5 — production-facing duration suggestion from the personal model.
// Phase 5.5 perf: sample cap + model cache so N task lookups share one build.
//
// Pure aside from a process-local cache keyed by history fingerprint.
// No network.

import {
  buildPersonalModel,
  historySampleFromRow,
  type PersonalModel,
  type PersonalModelPriors,
} from './model';
import {
  lookupContextualDuration,
  type DurationContext,
} from './contextDuration';
import {
  lookupHierarchicalDuration,
  type HierarchicalDuration,
  SYSTEM_DEFAULT_MINS,
} from './model';
import type { ContextualDuration } from './contextDuration';
import type { HistorySample } from './clusters';
import type { Confidence } from './types';
import { MODEL_VERSION } from './types';
import { priorStrengthForCleanN, authorityFromCleanN } from './learningRates';
import {
  buildWorkLeaves,
  matchWorkLeaf,
  type WorkLeaf,
} from './workIdentity';
import {
  computeRegimeLeafState,
  expectedMinsForRegimeState,
} from './regimeLeaf';
import { shrinkTowardPrior, durationFromSamples } from './stats';

export const MIN_SAMPLES_FOR_SUGGESTION = 2;

/** Cap samples fed into cluster build — keeps O(n²) clustering bounded. */
export const MODEL_HISTORY_CAP = 200;

export type V3EstimateSuggestion = {
  suggestedMins: number;
  confidence: Confidence;
  sampleCount: number;
  matchedLabel: string;
  source: 'measured' | 'lifecycle' | 'mixed';
  level?: string;
  modelVersion?: string;
  interval?: { low: number; high: number };
  authority?: string;
  reasons?: string[];
};

export type SuggestHistoryRow = {
  text: string;
  actual_mins?: number | null;
  created_at?: string | null;
  completed_at?: string | null;
  job_id?: string | null;
  location_text?: string | null;
  task_id?: string | null;
  subtask_count?: number | null;
  /** S1: when true, excluded from work-leaf clean duration. */
  duration_contaminated?: boolean | null;
};

export type SuggestEstimateOpts = {
  context?: DurationContext;
  priors?: Partial<PersonalModelPriors>;
  updatedAt?: string;
  model?: PersonalModel;
  samples?: HistorySample[];
};

function samplesFromHistory(history: SuggestHistoryRow[]): HistorySample[] {
  const slice =
    history.length > MODEL_HISTORY_CAP
      ? history.slice(0, MODEL_HISTORY_CAP)
      : history;
  return slice.map((h) =>
    historySampleFromRow({
      text: h.text,
      actual_mins: h.actual_mins,
      created_at: h.created_at,
      completed_at: h.completed_at,
      job_id: h.job_id,
      location_text: h.location_text,
    })
  );
}

function historyFingerprint(history: SuggestHistoryRow[]): string {
  const n = history.length;
  if (n === 0) return '0';
  const head = history[0];
  const tail = history[n - 1];
  const mid = history[Math.floor(n / 2)];
  return [
    n,
    head?.text?.slice(0, 40) ?? '',
    head?.actual_mins ?? '',
    head?.completed_at ?? '',
    mid?.text?.slice(0, 24) ?? '',
    mid?.actual_mins ?? '',
    tail?.text?.slice(0, 40) ?? '',
    tail?.actual_mins ?? '',
    tail?.completed_at ?? '',
  ].join('|');
}

type ModelCacheEntry = {
  key: string;
  model: PersonalModel;
  samples: HistorySample[];
};

let modelCache: ModelCacheEntry | null = null;

/** Test / hot-reload helper. */
export function clearPersonalModelCache(): void {
  modelCache = null;
  workLeafCache = null;
}

function resolveModel(
  history: SuggestHistoryRow[],
  opts?: SuggestEstimateOpts
): { model: PersonalModel; samples: HistorySample[] } {
  if (opts?.model && opts?.samples) {
    return { model: opts.model, samples: opts.samples };
  }
  if (opts?.model) {
    const samples = opts.samples ?? samplesFromHistory(history);
    return { model: opts.model, samples };
  }

  const key = historyFingerprint(history);
  if (modelCache && modelCache.key === key) {
    return { model: modelCache.model, samples: modelCache.samples };
  }

  const samples = samplesFromHistory(history);
  const updatedAt = opts?.updatedAt ?? '1970-01-01T00:00:00.000Z';
  const model = buildPersonalModel({
    userId: 'runtime',
    samples,
    priors: opts?.priors,
    updatedAt,
  });
  modelCache = { key, model, samples };
  return { model, samples };
}

function hasContext(ctx?: DurationContext): boolean {
  if (!ctx) return false;
  return Boolean(
    ctx.jobId ||
      ctx.locationText ||
      ctx.localHour != null ||
      ctx.period
  );
}

function fromLookup(
  result: HierarchicalDuration | ContextualDuration,
  source: V3EstimateSuggestion['source'] = 'measured'
): V3EstimateSuggestion | null {
  const n = result.distribution.sampleSize;
  if (result.level === 'system' || result.level === 'onboarding') {
    return null;
  }
  if (n < MIN_SAMPLES_FOR_SUGGESTION) return null;

  const label =
    result.clusterLabel ??
    (result.level === 'user' ? 'your usual time' : 'similar work');

  return {
    suggestedMins: Math.max(1, Math.round(result.distribution.expectedMins)),
    confidence: result.confidence.overall,
    sampleCount: n,
    matchedLabel: label,
    source,
    level: result.level,
    modelVersion: MODEL_VERSION,
    interval: result.distribution.interval,
    authority: result.authority,
    reasons: result.reasons,
  };
}


type WorkLeafCacheEntry = {
  key: string;
  leaves: WorkLeaf[];
};

let workLeafCache: WorkLeafCacheEntry | null = null;

function resolveWorkLeaves(history: SuggestHistoryRow[]): WorkLeaf[] {
  const key = historyFingerprint(history);
  if (workLeafCache && workLeafCache.key === key) return workLeafCache.leaves;
  const leafSamples = (
    history.length > MODEL_HISTORY_CAP
      ? history.slice(0, MODEL_HISTORY_CAP)
      : history
  ).map((h) => ({
    text: h.text,
    actualMins:
      typeof h.actual_mins === 'number' && h.actual_mins > 0
        ? h.actual_mins
        : null,
    completedAt: h.completed_at ?? null,
    createdAt: h.created_at ?? null,
    jobId: h.job_id ?? null,
    locationText: h.location_text ?? null,
    taskId: h.task_id ?? null,
    subtaskCount: h.subtask_count ?? null,
    durationContaminated: Boolean(h.duration_contaminated),
  }));
  const leaves = buildWorkLeaves(leafSamples);
  workLeafCache = { key, leaves };
  return leaves;
}

/**
 * S1: duration from work identity leaf (job + place + lexical fingerprint).
 * Preferred over text-cluster hierarchical when a leaf has enough clean samples.
 */
function suggestFromWorkIdentity(
  text: string,
  history: SuggestHistoryRow[],
  opts?: SuggestEstimateOpts
): V3EstimateSuggestion | null {
  const leaves = resolveWorkLeaves(history);
  if (leaves.length === 0) return null;

  const hit = matchWorkLeaf(
    {
      text,
      jobId: opts?.context?.jobId ?? null,
      locationText: opts?.context?.locationText ?? null,
    },
    leaves
  );
  if (!hit) return null;

  const mins = hit.leaf.cleanDurationMins;
  const n = mins.length;
  if (n < MIN_SAMPLES_FOR_SUGGESTION) return null;

  const floor = opts?.priors?.softFloorMins ?? SYSTEM_DEFAULT_MINS;
  const strength =
    opts?.priors?.priorStrength ?? priorStrengthForCleanN(n);
  const reasons = [`work identity n=${n}`];
  if (hit.leaf.parts.jobId) reasons.push('job-scoped work key');
  if (hit.leaf.parts.placeKey) reasons.push('place-scoped work key');

  // S3: regime leaf state when timed clean samples exist.
  let expected: number;
  let interval: { low: number; high: number } | undefined;
  let authority: string;
  let confidence: 'low' | 'medium' | 'high';

  const timed = hit.leaf.timedClean ?? [];
  if (timed.length >= 4) {
    const state = computeRegimeLeafState(
      timed.map((t) => ({ mins: t.mins, completedAt: t.completedAt }))
    );
    const reg = expectedMinsForRegimeState(
      timed.map((t) => ({ mins: t.mins, completedAt: t.completedAt })),
      state
    );
    if (reg.expectedMins == null || reg.expectedMins <= 0) return null;
    expected = reg.expectedMins;
    if (reg.interval) interval = reg.interval;
    reasons.push(...reg.reasons);
    if (reg.phase === 'shifting') {
      authority = 'contested';
      confidence = 'low';
    } else if (reg.phase === 'post_shift') {
      authority = reg.authority === 'suggest' ? 'suggest' : 'observe';
      confidence = 'medium';
    } else {
      const authBand = authorityFromCleanN(n);
      authority =
        authBand === 'established'
          ? 'strong'
          : authBand === 'forming'
            ? 'suggest'
            : 'observe';
      confidence =
        authBand === 'established'
          ? 'high'
          : authBand === 'forming'
            ? 'medium'
            : 'low';
    }
  } else {
    const dist = durationFromSamples(mins, 'median');
    if (!dist || dist.expectedMins <= 0) return null;
    expected = dist.expectedMins;
    interval = dist.interval ?? undefined;
    if (n < 4) {
      expected = Math.round(shrinkTowardPrior(expected, floor, n, strength));
      reasons.push('sparse work leaf; shrunk toward prior');
    }
    const authBand = authorityFromCleanN(n);
    authority =
      authBand === 'established'
        ? 'strong'
        : authBand === 'forming'
          ? 'suggest'
          : 'observe';
    confidence =
      authBand === 'established' ? 'high' : authBand === 'forming' ? 'medium' : 'low';
  }

  const label =
    hit.leaf.parts.lexicalFingerprint.replace(/\|/g, ' ').trim() ||
    'this kind of work';

  return {
    suggestedMins: Math.max(1, Math.round(expected)),
    confidence,
    sampleCount: n,
    matchedLabel: label,
    source: 'measured',
    level: 'work',
    modelVersion: MODEL_VERSION,
    interval,
    authority,
    reasons,
  };
}

/**
 * Duration suggestion from the V3 personal model.
 * Model is built once per history fingerprint and reused across lookups.
 */
export function suggestEstimateV3(
  text: string,
  history: SuggestHistoryRow[],
  opts?: SuggestEstimateOpts
): V3EstimateSuggestion | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // S1: work identity leaf first (job/place/fingerprint) — not raw text cluster.
  const fromWork = suggestFromWorkIdentity(trimmed, history, opts);
  if (fromWork) return fromWork;

  const { model, samples } = resolveModel(history, opts);

  // FP-1: hierarchical lookup uses adaptive prior strength from leaf clean-n.
  // Contextual path uses same schedule via opts.priorStrength when provided.
  if (hasContext(opts?.context)) {
    const contextual = lookupContextualDuration(
      trimmed,
      model,
      samples,
      opts!.context!,
      { priorStrength: opts?.priors?.priorStrength }
    );
    const mapped = fromLookup(contextual, 'measured');
    if (mapped) return mapped;
  }

  const hierarchical = lookupHierarchicalDuration(trimmed, model, {
    priorStrength: opts?.priors?.priorStrength,
  });
  return fromLookup(hierarchical, 'measured');
}

export function personalModelFromHistory(
  history: SuggestHistoryRow[],
  opts?: {
    userId?: string;
    priors?: Partial<PersonalModelPriors>;
    updatedAt?: string;
  }
): { model: PersonalModel; samples: HistorySample[] } {
  const samples = samplesFromHistory(history);
  const model = buildPersonalModel({
    userId: opts?.userId ?? 'runtime',
    samples,
    priors: opts?.priors,
    updatedAt: opts?.updatedAt ?? '1970-01-01T00:00:00.000Z',
  });
  modelCache = {
    key: historyFingerprint(history),
    model,
    samples,
  };
  return { model, samples };
}
