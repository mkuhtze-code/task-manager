/**
 * Calibrate the runtime brain from closed prediction loops.
 *
 * Pure. Deterministic. Never invents. Only uses predictions that have
 * both suggested_mins and actual_mins.
 */

import type { PredictionLogEntry } from '@/lib/thinking/types';

export const BASE_SOFT_FLOOR_MINS = 30;

export type SoftCalibration = {
  softFloorMins: number;
  blendScale: number;
  sampleCount: number;
  explain: string | null;
};

const MIN_SAMPLES = 5;
const FLOOR_MIN = 15;
const FLOOR_MAX = 45;

export function calibrateFromOutcomes(
  entries: readonly PredictionLogEntry[],
  baseFloor: number = BASE_SOFT_FLOOR_MINS
): SoftCalibration {
  const closed = entries.filter(
    (e) =>
      e.actual_mins != null &&
      e.actual_mins > 0 &&
      e.suggested_mins != null &&
      e.suggested_mins > 0
  );

  if (closed.length < MIN_SAMPLES) {
    return {
      softFloorMins: baseFloor,
      blendScale: 1,
      sampleCount: closed.length,
      explain: null,
    };
  }

  const ratios = closed.map(
    (e) => (e.actual_mins as number) / (e.suggested_mins as number)
  );
  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  const medianRatio =
    ratios.length % 2 === 0 ? (ratios[mid - 1] + ratios[mid]) / 2 : ratios[mid];

  const lowEstActuals = closed
    .filter(
      (e) =>
        (e.estimated_mins || 0) <= 15 || (e.suggested_mins as number) <= 40
    )
    .map((e) => e.actual_mins as number)
    .sort((a, b) => a - b);
  let softFloorMins = baseFloor;
  if (lowEstActuals.length >= 3) {
    const m = Math.floor(lowEstActuals.length / 2);
    const med =
      lowEstActuals.length % 2 === 0
        ? Math.round((lowEstActuals[m - 1] + lowEstActuals[m]) / 2)
        : lowEstActuals[m];
    softFloorMins = Math.min(
      FLOOR_MAX,
      Math.max(FLOOR_MIN, Math.round((baseFloor + med) / 2))
    );
  }

  let blendScale = 1;
  if (medianRatio > 1.15) blendScale = 1.2;
  else if (medianRatio > 1.05) blendScale = 1.1;
  else if (medianRatio < 0.85) blendScale = 0.75;
  else if (medianRatio < 0.95) blendScale = 0.9;

  const pct = Math.round(medianRatio * 100);
  const explain =
    medianRatio > 1.05
      ? `Learned times have been ~${pct - 100}% short — leaning more on history`
      : medianRatio < 0.95
        ? `Learned times have been ~${100 - pct}% long — leaning less on history`
        : null;

  return {
    softFloorMins,
    blendScale,
    sampleCount: closed.length,
    explain,
  };
}
