// lib/thinking/v3/suggest.ts
//
// Phase 5 — production-facing duration suggestion from the personal model.
//
// Maps hierarchical / contextual duration into the same shape the runtime
// already consumes (suggestedMins, confidence, sampleCount, matchedLabel,
// source). Callers of suggestEstimate do not change.
//
// Pure. Deterministic. No network.

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
import { lookupHierarchicalDuration, type HierarchicalDuration } from './model';
import type { ContextualDuration } from './contextDuration';
import type { HistorySample } from './clusters';
import type { Confidence } from './types';
import { MODEL_VERSION } from './types';

export const MIN_SAMPLES_FOR_SUGGESTION = 2;

export type V3EstimateSuggestion = {
  suggestedMins: number;
  confidence: Confidence;
  sampleCount: number;
  matchedLabel: string;
  /** measured = timed history; lifecycle = structure fallback; mixed = both. */
  source: 'measured' | 'lifecycle' | 'mixed';
  /** V3 diagnostics — optional for callers that care. */
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
};

export type SuggestEstimateOpts = {
  /** Optional context for conditional duration (job / place / period). */
  context?: DurationContext;
  priors?: Partial<PersonalModelPriors>;
  /** Explicit clock for model updatedAt — defaults only if omitted. */
  updatedAt?: string;
  /** Pre-built model to avoid rebuild when caller already has one. */
  model?: PersonalModel;
  /** Pre-mapped samples when model is also pre-built. */
  samples?: HistorySample[];
};

function samplesFromHistory(history: SuggestHistoryRow[]): HistorySample[] {
  return history.map((h) =>
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
  // Prior / system with zero samples is not a measured suggestion.
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

/**
 * Duration suggestion from the V3 personal model.
 * Prefer contextual lookup when context is provided and evidence supports it.
 */
export function suggestEstimateV3(
  text: string,
  history: SuggestHistoryRow[],
  opts?: SuggestEstimateOpts
): V3EstimateSuggestion | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const samples = opts?.samples ?? samplesFromHistory(history);
  const updatedAt = opts?.updatedAt ?? '1970-01-01T00:00:00.000Z';
  const model =
    opts?.model ??
    buildPersonalModel({
      userId: 'runtime',
      samples,
      priors: opts?.priors,
      updatedAt,
    });

  if (hasContext(opts?.context)) {
    const contextual = lookupContextualDuration(
      trimmed,
      model,
      samples,
      opts!.context!
    );
    const mapped = fromLookup(contextual, 'measured');
    if (mapped) return mapped;
  }

  const hierarchical = lookupHierarchicalDuration(trimmed, model);
  return fromLookup(hierarchical, 'measured');
}

/**
 * Build a PersonalModel once for a history slice (callers that suggest often).
 */
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
  return { model, samples };
}
