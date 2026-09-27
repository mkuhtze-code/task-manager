// lib/thinking/v3/calibrationMetrics.ts
//
// Phase 5.5 — symmetric calibration metrics.
// Prefer log(actual/predicted) so over- and under-estimation are comparable.

import { median } from './stats';

export type CalibrationPair = {
  predictedMins: number;
  actualMins: number;
};

export type CalibrationReport = {
  medianLogRatio: number | null;
  male: number | null;
  medianAbsErrorMins: number | null;
  underestimateRate: number | null;
  overestimateRate: number | null;
  medianSignedErrorMins: number | null;
  sampleCount: number;
  explain: string | null;
};

export function logRatio(actual: number, predicted: number): number | null {
  if (!(actual > 0) || !(predicted > 0)) return null;
  return Math.log(actual / predicted);
}

export function calibrateFromPairs(pairs: CalibrationPair[]): CalibrationReport {
  const usable = pairs.filter((p) => p.predictedMins > 0 && p.actualMins > 0);
  if (usable.length === 0) {
    return {
      medianLogRatio: null,
      male: null,
      medianAbsErrorMins: null,
      underestimateRate: null,
      overestimateRate: null,
      medianSignedErrorMins: null,
      sampleCount: 0,
      explain: null,
    };
  }

  const logs = usable
    .map((p) => logRatio(p.actualMins, p.predictedMins))
    .filter((x): x is number => x != null);
  const absLogs = logs.map((x) => Math.abs(x));
  const absErrs = usable.map((p) => Math.abs(p.actualMins - p.predictedMins));
  const signed = usable.map((p) => p.actualMins - p.predictedMins);

  const under = usable.filter((p) => p.actualMins > p.predictedMins).length;
  const over = usable.filter((p) => p.actualMins < p.predictedMins).length;

  const medLog = median(logs);
  const male =
    absLogs.length ? absLogs.reduce((a, b) => a + b, 0) / absLogs.length : null;
  const medAbs = median(absErrs);
  const medSigned = median(signed);

  let explain: string | null = null;
  if (medLog != null && usable.length >= 4) {
    if (medLog > 0.05) {
      const pct = Math.round((Math.exp(medLog) - 1) * 100);
      explain = `Predictions have been ~${pct}% short (symmetric log bias)`;
    } else if (medLog < -0.05) {
      const pct = Math.round((1 - Math.exp(medLog)) * 100);
      explain = `Predictions have been ~${pct}% long (symmetric log bias)`;
    }
  }

  return {
    medianLogRatio: medLog,
    male,
    medianAbsErrorMins: medAbs == null ? null : Math.round(medAbs),
    underestimateRate: under / usable.length,
    overestimateRate: over / usable.length,
    medianSignedErrorMins: medSigned == null ? null : Math.round(medSigned),
    sampleCount: usable.length,
    explain,
  };
}
