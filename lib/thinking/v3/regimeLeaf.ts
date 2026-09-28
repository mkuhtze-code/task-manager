/**
 * S3 / WS-B — Regime as first-class workKey leaf state.
 *
 * Detection (any of):
 *   1. Window test — recent vs prior medians + MAD gate (FP-3)
 *   2. CUSUM — sequential log-deviation from leaf median (fires at n≥3 recent)
 *   3. Day-window — last 14d clean vs previous 14d (sparse completers)
 *
 * Response:
 *   stable     → full history median (recency OK)
 *   shifting   → recent-only point estimate; authority contested; wide interval
 *   post_shift → blend with decaying preShiftWeight; recover toward forming
 *
 * Pure. Deterministic. No network.
 */

import { median, madScaled } from './stats';
import {
  detectRegimeShift,
  regimeAwareExpectedMins,
  type TimedDurationSample,
  type RegimeDetection,
  REGIME_RECENT_K,
  REGIME_MIN_WINDOW,
  REGIME_LOG_THRESHOLD,
  REGIME_PRE_SHIFT_WEIGHT,
} from './regime';

export type RegimePhase = 'stable' | 'shifting' | 'post_shift';

export type RegimeLeafState = {
  phase: RegimePhase;
  direction: 'up' | 'down' | 'none';
  shiftedAt: string | null;
  priorMedian: number | null;
  recentMedian: number | null;
  logRatio: number | null;
  preShiftWeight: number;
  postShiftCleanN: number;
  trigger: 'none' | 'window' | 'cusum' | 'day_window';
  reasons: string[];
};

export type RegimeExpected = {
  expectedMins: number | null;
  interval: { low: number; high: number } | null;
  sampleSize: number;
  phase: RegimePhase;
  authority: 'observe' | 'suggest' | 'strong' | 'contested';
  reasons: string[];
};

export const CUSUM_THRESHOLD = 1.2;
export const CUSUM_MIN_RECENT = 3;
export const DAY_WINDOW_DAYS = 14;
export const POST_SHIFT_CONFIRM = 2;

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

export function detectCusumShift(
  samples: TimedDurationSample[],
  opts?: { threshold?: number; minRecent?: number; recentK?: number }
): RegimeDetection & { trigger: 'cusum' | 'none' } {
  const threshold = opts?.threshold ?? CUSUM_THRESHOLD;
  const minRecent = opts?.minRecent ?? CUSUM_MIN_RECENT;
  const recentK = opts?.recentK ?? REGIME_RECENT_K;
  const ordered = sortChronological(samples);
  const empty: RegimeDetection & { trigger: 'cusum' | 'none' } = {
    shifted: false,
    direction: 'none',
    priorMedian: null,
    recentMedian: null,
    logRatio: null,
    priorCount: 0,
    recentCount: 0,
    preShiftWeight: 1,
    reasons: ['cusum: insufficient samples'],
    trigger: 'none',
  };
  if (ordered.length < minRecent + REGIME_MIN_WINDOW) return empty;

  const recent = ordered.slice(-recentK);
  const prior = ordered.slice(0, Math.max(0, ordered.length - recent.length));
  if (prior.length < REGIME_MIN_WINDOW || recent.length < minRecent) {
    return { ...empty, reasons: ['cusum: window too small'] };
  }

  const priorMed = median(prior.map((s) => s.mins));
  if (priorMed == null || priorMed <= 0) return empty;

  let cusumPos = 0;
  let cusumNeg = 0;
  for (const s of recent) {
    const lr = Math.log(s.mins / priorMed);
    cusumPos = Math.max(0, cusumPos + lr);
    cusumNeg = Math.min(0, cusumNeg + lr);
  }
  const firedUp = cusumPos >= threshold;
  const firedDown = Math.abs(cusumNeg) >= threshold;
  if (!firedUp && !firedDown) {
    return {
      ...empty,
      priorMedian: priorMed,
      recentMedian: median(recent.map((s) => s.mins)),
      priorCount: prior.length,
      recentCount: recent.length,
      reasons: ['cusum: no sustained run'],
    };
  }

  const recentMed = median(recent.map((s) => s.mins));
  const lr =
    recentMed != null && recentMed > 0 && priorMed > 0
      ? Math.log(recentMed / priorMed)
      : null;
  return {
    shifted: true,
    direction: firedUp ? 'up' : 'down',
    priorMedian: priorMed,
    recentMedian: recentMed,
    logRatio: lr,
    priorCount: prior.length,
    recentCount: recent.length,
    preShiftWeight: 0,
    reasons: [
      `cusum ${firedUp ? 'up' : 'down'}: S+=${cusumPos.toFixed(2)} S-=${cusumNeg.toFixed(2)}`,
    ],
    trigger: 'cusum',
  };
}

export function detectDayWindowShift(
  samples: TimedDurationSample[],
  opts?: { dayWindow?: number; logThreshold?: number }
): RegimeDetection & { trigger: 'day_window' | 'none' } {
  const dayWindow = opts?.dayWindow ?? DAY_WINDOW_DAYS;
  const logThreshold = opts?.logThreshold ?? REGIME_LOG_THRESHOLD;
  const ordered = sortChronological(samples);
  const empty: RegimeDetection & { trigger: 'day_window' | 'none' } = {
    shifted: false,
    direction: 'none',
    priorMedian: null,
    recentMedian: null,
    logRatio: null,
    priorCount: 0,
    recentCount: 0,
    preShiftWeight: 1,
    reasons: ['day_window: insufficient'],
    trigger: 'none',
  };
  if (ordered.length < REGIME_MIN_WINDOW * 2) return empty;

  const end = parseTime(ordered[ordered.length - 1].completedAt);
  if (!end) return empty;
  const recentStart = end - dayWindow * 24 * 60 * 60 * 1000;
  const priorStart = recentStart - dayWindow * 24 * 60 * 60 * 1000;

  const recent = ordered.filter((s) => parseTime(s.completedAt) >= recentStart);
  const prior = ordered.filter((s) => {
    const t = parseTime(s.completedAt);
    return t >= priorStart && t < recentStart;
  });
  if (prior.length < 3 || recent.length < 3) {
    return { ...empty, reasons: ['day_window: sparse windows'] };
  }

  const priorMed = median(prior.map((s) => s.mins));
  const recentMed = median(recent.map((s) => s.mins));
  if (
    priorMed == null ||
    recentMed == null ||
    priorMed <= 0 ||
    recentMed <= 0
  ) {
    return empty;
  }
  const lr = Math.log(recentMed / priorMed);
  const priorMad = madScaled(prior.map((s) => s.mins));
  const madGate =
    priorMad != null && priorMad > 0
      ? Math.abs(recentMed - priorMed) >= 1.5 * priorMad
      : true;
  if (Math.abs(lr) < logThreshold || !madGate) {
    return {
      ...empty,
      priorMedian: priorMed,
      recentMedian: recentMed,
      logRatio: lr,
      priorCount: prior.length,
      recentCount: recent.length,
      reasons: ['day_window: no shift'],
    };
  }
  return {
    shifted: true,
    direction: lr > 0 ? 'up' : 'down',
    priorMedian: priorMed,
    recentMedian: recentMed,
    logRatio: lr,
    priorCount: prior.length,
    recentCount: recent.length,
    preShiftWeight: 0,
    reasons: [
      `day_window ${lr > 0 ? 'up' : 'down'}: recent ${Math.round(recentMed)}m vs prior ${Math.round(priorMed)}m`,
    ],
    trigger: 'day_window',
  };
}

function countPostShiftConfirming(
  ordered: TimedDurationSample[],
  recentMedian: number | null,
  direction: 'up' | 'down' | 'none',
  recentK: number
): number {
  if (recentMedian == null || direction === 'none') return 0;
  const recent = ordered.slice(-recentK);
  let n = 0;
  for (const s of recent) {
    if (direction === 'up' && s.mins >= recentMedian * 0.85) n++;
    else if (direction === 'down' && s.mins <= recentMedian * 1.15) n++;
  }
  return n;
}

export function computeRegimeLeafState(
  samples: TimedDurationSample[],
  opts?: { previous?: RegimeLeafState | null }
): RegimeLeafState {
  const ordered = sortChronological(samples);
  const base: RegimeLeafState = {
    phase: 'stable',
    direction: 'none',
    shiftedAt: null,
    priorMedian: null,
    recentMedian: null,
    logRatio: null,
    preShiftWeight: 1,
    postShiftCleanN: 0,
    trigger: 'none',
    reasons: ['stable'],
  };
  if (ordered.length < REGIME_MIN_WINDOW) {
    return { ...base, reasons: ['insufficient samples for regime'] };
  }

  const windowDet = detectRegimeShift(ordered);
  const cusumDet = detectCusumShift(ordered);
  const dayDet = detectDayWindowShift(ordered);

  let chosen: (RegimeDetection & { trigger?: string }) | null = null;
  let trigger: RegimeLeafState['trigger'] = 'none';

  if (windowDet.shifted) {
    chosen = windowDet;
    trigger = 'window';
  } else if (cusumDet.shifted) {
    chosen = cusumDet;
    trigger = 'cusum';
  } else if (dayDet.shifted) {
    chosen = dayDet;
    trigger = 'day_window';
  }

  if (!chosen || !chosen.shifted) {
    if (
      opts?.previous?.phase === 'post_shift' ||
      opts?.previous?.phase === 'shifting'
    ) {
      const k = opts.previous.postShiftCleanN + 1;
      const weight = Math.max(
        0.05,
        REGIME_PRE_SHIFT_WEIGHT * Math.pow(0.7, Math.max(0, k - 1))
      );
      return {
        ...opts.previous,
        phase: 'post_shift',
        preShiftWeight: weight,
        postShiftCleanN: k,
        reasons: [
          ...(opts.previous.reasons ?? []),
          `post_shift recovery k=${k} weight=${weight.toFixed(2)}`,
        ],
      };
    }
    return {
      ...base,
      priorMedian: windowDet.priorMedian,
      recentMedian: windowDet.recentMedian,
      logRatio: windowDet.logRatio,
      reasons: ['no regime shift detected'],
    };
  }

  const confirm = countPostShiftConfirming(
    ordered,
    chosen.recentMedian,
    chosen.direction,
    REGIME_RECENT_K
  );
  const shiftedAt =
    ordered.length > 0 ? ordered[ordered.length - 1].completedAt : null;

  if (confirm >= POST_SHIFT_CONFIRM) {
    const k = confirm;
    const weight = Math.max(
      0.05,
      REGIME_PRE_SHIFT_WEIGHT *
        Math.pow(0.7, Math.max(0, k - POST_SHIFT_CONFIRM))
    );
    return {
      phase: 'post_shift',
      direction: chosen.direction,
      shiftedAt,
      priorMedian: chosen.priorMedian,
      recentMedian: chosen.recentMedian,
      logRatio: chosen.logRatio,
      preShiftWeight: weight,
      postShiftCleanN: k,
      trigger,
      reasons: [...(chosen.reasons ?? []), `post_shift confirmed k=${k}`],
    };
  }

  return {
    phase: 'shifting',
    direction: chosen.direction,
    shiftedAt,
    priorMedian: chosen.priorMedian,
    recentMedian: chosen.recentMedian,
    logRatio: chosen.logRatio,
    preShiftWeight: 0,
    postShiftCleanN: confirm,
    trigger,
    reasons: [...(chosen.reasons ?? []), 'shifting: recent-only estimate'],
  };
}

export function expectedMinsForRegimeState(
  samples: TimedDurationSample[],
  state?: RegimeLeafState | null
): RegimeExpected {
  const ordered = sortChronological(samples);
  if (ordered.length === 0) {
    return {
      expectedMins: null,
      interval: null,
      sampleSize: 0,
      phase: 'stable',
      authority: 'observe',
      reasons: ['no samples'],
    };
  }

  const st = state ?? computeRegimeLeafState(ordered);
  const allMins = ordered.map((s) => s.mins);
  const recent = ordered.slice(-REGIME_RECENT_K);
  const recentMins = recent.map((s) => s.mins);

  if (st.phase === 'shifting') {
    const exp = median(recentMins);
    const prior = st.priorMedian;
    const lowCandidates = [exp, prior].filter(
      (x): x is number => x != null && x > 0
    );
    const low = lowCandidates.length
      ? Math.round(Math.min(...lowCandidates) * 0.85)
      : null;
    const high = lowCandidates.length
      ? Math.round(Math.max(...lowCandidates) * 1.15)
      : null;
    return {
      expectedMins: exp == null ? null : Math.round(exp),
      interval: low != null && high != null ? { low, high } : null,
      sampleSize: ordered.length,
      phase: 'shifting',
      authority: 'contested',
      reasons: st.reasons,
    };
  }

  if (st.phase === 'post_shift') {
    const blend = regimeAwareExpectedMins(ordered, {
      shifted: true,
      direction: st.direction,
      priorMedian: st.priorMedian,
      recentMedian: st.recentMedian,
      logRatio: st.logRatio,
      priorCount: Math.max(0, ordered.length - recent.length),
      recentCount: recent.length,
      preShiftWeight: st.preShiftWeight,
      reasons: st.reasons,
    });
    const exp = blend.expectedMins;
    const mad = madScaled(recentMins);
    const low =
      exp != null ? Math.round(Math.max(1, exp - (mad ?? exp * 0.25))) : null;
    const high =
      exp != null ? Math.round(exp + (mad ?? exp * 0.25)) : null;
    return {
      expectedMins: exp,
      interval: low != null && high != null ? { low, high } : null,
      sampleSize: ordered.length,
      phase: 'post_shift',
      authority: st.postShiftCleanN >= 5 ? 'suggest' : 'observe',
      reasons: st.reasons,
    };
  }

  const exp = median(allMins);
  const mad = madScaled(allMins);
  const low =
    exp != null ? Math.round(Math.max(1, exp - (mad ?? exp * 0.2))) : null;
  const high =
    exp != null ? Math.round(exp + (mad ?? exp * 0.2)) : null;
  const n = ordered.length;
  const authority =
    n >= 7 ? 'strong' : n >= 3 ? 'suggest' : 'observe';
  return {
    expectedMins: exp == null ? null : Math.round(exp),
    interval: low != null && high != null ? { low, high } : null,
    sampleSize: n,
    phase: 'stable',
    authority,
    reasons: st.reasons,
  };
}

export function regimeStateFromWorkLeaf(leaf: {
  timedClean: Array<{ mins: number; completedAt: string }>;
  cleanDurationMins: number[];
}): RegimeLeafState {
  const timed: TimedDurationSample[] =
    leaf.timedClean.length > 0
      ? leaf.timedClean.map((t) => ({
          mins: t.mins,
          completedAt: t.completedAt,
        }))
      : [];
  return computeRegimeLeafState(timed);
}
