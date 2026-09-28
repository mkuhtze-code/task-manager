/**
 * FP-3 — Day 7 / 14 / 30 calibration harness.
 *
 * Offline/online evaluation of prediction quality on clean pairs.
 * Pure. Deterministic. Privacy-preserving (in-process aggregates only).
 */

import {
  calibrateFromPairs,
  type CalibrationPair,
  type CalibrationReport,
} from './calibrationMetrics';

export type TimedCalibrationPair = CalibrationPair & {
  /** ISO time of outcome (completion). */
  completedAt: string;
  clusterKey?: string | null;
};

export type HorizonDays = 7 | 14 | 30;

export type HorizonCalibration = {
  horizonDays: HorizonDays;
  report: CalibrationReport;
  /** Pairs that fell inside the window ending at `asOf`. */
  pairCount: number;
};

export type CalibrationProgression = {
  asOf: string;
  day7: HorizonCalibration;
  day14: HorizonCalibration;
  day30: HorizonCalibration;
  /** True when |medianLogRatio| is improving from day7 → day30 when enough data. */
  improving: boolean | null;
  reasons: string[];
};

function parseTime(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Filter pairs completed within the last `horizonDays` ending at `asOf`.
 */
export function pairsInHorizon(
  pairs: TimedCalibrationPair[],
  asOf: string | Date,
  horizonDays: number
): TimedCalibrationPair[] {
  const end =
    typeof asOf === 'string' ? parseTime(asOf) : (asOf as Date).getTime();
  if (!end) return [];
  const start = end - horizonDays * 24 * 60 * 60 * 1000;
  return pairs.filter((p) => {
    const t = parseTime(p.completedAt);
    return t >= start && t <= end && p.actualMins > 0 && p.predictedMins > 0;
  });
}

export function calibrationAtHorizon(
  pairs: TimedCalibrationPair[],
  asOf: string | Date,
  horizonDays: HorizonDays
): HorizonCalibration {
  const windowed = pairsInHorizon(pairs, asOf, horizonDays);
  const report = calibrateFromPairs(windowed);
  return {
    horizonDays,
    report,
    pairCount: windowed.length,
  };
}

/**
 * Day 7 / 14 / 30 progression snapshot for FP-3 acceptance.
 */
export function calibrationProgression(
  pairs: TimedCalibrationPair[],
  asOf: string | Date
): CalibrationProgression {
  const asOfIso =
    typeof asOf === 'string' ? asOf : (asOf as Date).toISOString();
  const day7 = calibrationAtHorizon(pairs, asOf, 7);
  const day14 = calibrationAtHorizon(pairs, asOf, 14);
  const day30 = calibrationAtHorizon(pairs, asOf, 30);
  const reasons: string[] = [];

  const a = day7.report.medianLogRatio;
  const b = day30.report.medianLogRatio;
  let improving: boolean | null = null;
  if (
    a != null &&
    b != null &&
    day7.pairCount >= 3 &&
    day30.pairCount >= 5
  ) {
    improving = Math.abs(b) < Math.abs(a) - 0.02;
    reasons.push(
      improving
        ? 'log calibration tighter at day30 vs day7'
        : 'log calibration not yet tighter at day30 vs day7'
    );
  } else {
    reasons.push('insufficient pairs to judge improvement');
  }

  return {
    asOf: asOfIso,
    day7,
    day14,
    day30,
    improving,
    reasons,
  };
}

/**
 * Fit-regret proxy: fraction of pairs where |actual - predicted| / predicted > tol
 * on clean outcomes (for offline sim).
 */
export function fitRegretRate(
  pairs: CalibrationPair[],
  tol = 0.5
): number | null {
  const usable = pairs.filter((p) => p.predictedMins > 0 && p.actualMins > 0);
  if (usable.length < 3) return null;
  const misses = usable.filter(
    (p) => Math.abs(p.actualMins - p.predictedMins) / p.predictedMins > tol
  );
  return misses.length / usable.length;
}
