/**
 * FP-3 — Regime / change-point detection per leaf.
 *
 * If recent clean duration samples disagree with the prior window beyond a
 * robust threshold, down-weight pre-shift mass immediately (do not wait for
 * history-cap eviction).
 *
 * Pure. Deterministic.
 */

import { median, madScaled } from './stats';

export type TimedDurationSample = {
  mins: number;
  /** ISO completed-at; required for ordering. */
  completedAt: string;
};

export type RegimeDetection = {
  shifted: boolean;
  direction: 'up' | 'down' | 'none';
  priorMedian: number | null;
  recentMedian: number | null;
  /** log(recent/prior); null when undefined. */
  logRatio: number | null;
  priorCount: number;
  recentCount: number;
  /**
   * Weight applied to pre-shift samples when blending (1 = full, 0 = ignore).
   * Recent window always weight 1.
   */
  preShiftWeight: number;
  reasons: string[];
};

/** Minimum samples in each window before a shift can be declared. */
export const REGIME_MIN_WINDOW = 4;
/** Prefer last N clean samples as "recent" when timestamps allow. */
export const REGIME_RECENT_K = 5;
/**
 * |log(recent/prior)| threshold ≈ 40% relative change.
 * Tunable; relative behaviour is fixed: large sustained shift → down-weight old.
 */
export const REGIME_LOG_THRESHOLD = 0.35;
/** Floor weight for pre-shift samples after a detected shift. */
export const REGIME_PRE_SHIFT_WEIGHT = 0.3;

function parseTime(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function sortChronological(
  samples: TimedDurationSample[]
): TimedDurationSample[] {
  return [...samples]
    .filter((s) => s.mins > 0 && s.completedAt)
    .sort((a, b) => parseTime(a.completedAt) - parseTime(b.completedAt));
}

/**
 * Detect a duration regime shift on an ordered leaf sample stream.
 */
export function detectRegimeShift(
  samples: TimedDurationSample[],
  opts?: {
    recentK?: number;
    minWindow?: number;
    logThreshold?: number;
    preShiftWeight?: number;
  }
): RegimeDetection {
  const recentK = opts?.recentK ?? REGIME_RECENT_K;
  const minWindow = opts?.minWindow ?? REGIME_MIN_WINDOW;
  const logThreshold = opts?.logThreshold ?? REGIME_LOG_THRESHOLD;
  const preShiftWeight = opts?.preShiftWeight ?? REGIME_PRE_SHIFT_WEIGHT;
  const reasons: string[] = [];

  const ordered = sortChronological(samples);
  if (ordered.length < minWindow * 2) {
    return {
      shifted: false,
      direction: 'none',
      priorMedian: null,
      recentMedian: null,
      logRatio: null,
      priorCount: Math.max(0, ordered.length - recentK),
      recentCount: Math.min(ordered.length, recentK),
      preShiftWeight: 1,
      reasons: ['insufficient samples for regime test'],
    };
  }

  const recent = ordered.slice(-recentK);
  const prior = ordered.slice(0, Math.max(0, ordered.length - recentK));
  let priorWindow = prior;
  let recentWindow = recent;
  if (prior.length < minWindow) {
    const split = Math.floor(ordered.length / 2);
    priorWindow = ordered.slice(0, split);
    recentWindow = ordered.slice(split);
  }

  const priorMins = priorWindow.map((s) => s.mins);
  const recentMins = recentWindow.map((s) => s.mins);
  const priorMed = median(priorMins);
  const recentMed = median(recentMins);

  if (
    priorMed == null ||
    recentMed == null ||
    priorMed <= 0 ||
    recentMed <= 0 ||
    priorMins.length < minWindow ||
    recentMins.length < minWindow
  ) {
    return {
      shifted: false,
      direction: 'none',
      priorMedian: priorMed,
      recentMedian: recentMed,
      logRatio: null,
      priorCount: priorMins.length,
      recentCount: recentMins.length,
      preShiftWeight: 1,
      reasons: ['windows too small or non-positive medians'],
    };
  }

  const lr = Math.log(recentMed / priorMed);
  const priorMad = madScaled(priorMins);
  const madGate =
    priorMad != null && priorMad > 0
      ? Math.abs(recentMed - priorMed) >= 1.5 * priorMad
      : true;

  const shifted = Math.abs(lr) >= logThreshold && madGate;
  const direction: RegimeDetection['direction'] = !shifted
    ? 'none'
    : lr > 0
      ? 'up'
      : 'down';

  if (shifted) {
    reasons.push(
      `regime ${direction}: recent median ${Math.round(recentMed)}m vs prior ${Math.round(priorMed)}m (log=${lr.toFixed(2)})`
    );
    reasons.push(`pre-shift weight ${preShiftWeight}`);
  } else {
    reasons.push('no regime shift detected');
  }

  return {
    shifted,
    direction,
    priorMedian: priorMed,
    recentMedian: recentMed,
    logRatio: lr,
    priorCount: priorMins.length,
    recentCount: recentMins.length,
    preShiftWeight: shifted ? preShiftWeight : 1,
    reasons,
  };
}

/**
 * Blend expected minutes with regime-aware weighting.
 * Pre-shift samples contribute preShiftWeight; recent samples full weight.
 */
export function regimeAwareExpectedMins(
  samples: TimedDurationSample[],
  regime?: RegimeDetection | null
): { expectedMins: number | null; sampleSize: number; reasons: string[] } {
  const ordered = sortChronological(samples);
  if (ordered.length === 0) {
    return { expectedMins: null, sampleSize: 0, reasons: ['no samples'] };
  }

  const det = regime ?? detectRegimeShift(ordered);
  if (!det.shifted || det.preShiftWeight >= 0.99) {
    const m = median(ordered.map((s) => s.mins));
    return {
      expectedMins: m == null ? null : Math.round(m),
      sampleSize: ordered.length,
      reasons: det.reasons,
    };
  }

  const recentK = REGIME_RECENT_K;
  const recent = ordered.slice(-Math.min(recentK, ordered.length));
  const prior = ordered.slice(0, Math.max(0, ordered.length - recent.length));

  const expanded: number[] = [];
  for (const s of recent) expanded.push(s.mins);
  const w = det.preShiftWeight;
  if (w > 0 && prior.length > 0) {
    const keep = Math.max(1, Math.round(prior.length * w));
    for (const s of prior.slice(-keep)) expanded.push(s.mins);
  }

  const m = median(expanded);
  return {
    expectedMins: m == null ? null : Math.round(m),
    sampleSize: ordered.length,
    reasons: det.reasons,
  };
}

/**
 * Build timed samples from history-like rows (clean duration only).
 */
export function timedSamplesFromHistory(
  rows: Array<{
    actual_mins?: number | null;
    completed_at?: string | null;
  }>
): TimedDurationSample[] {
  const out: TimedDurationSample[] = [];
  for (const r of rows) {
    if (
      typeof r.actual_mins === 'number' &&
      r.actual_mins > 0 &&
      r.completed_at
    ) {
      out.push({ mins: r.actual_mins, completedAt: r.completed_at });
    }
  }
  return out;
}
