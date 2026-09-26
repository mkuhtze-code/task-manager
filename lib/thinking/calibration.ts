/**
 * Calibrate the runtime brain from closed prediction loops.
 *
 * Pure. Deterministic. Never invents.
 *
 * Learning phases (first billing cycle oriented):
 * - prior (0–1 closed samples): onboarding soft floor only
 * - early (2–3): dampened move toward evidence
 * - forming (4): stronger partial blend
 * - established (5+): full calibration as before
 *
 * Observed evidence always wins over intention when trustworthy;
 * weak samples must not yank the model.
 */

import type { PredictionLogEntry } from '@/lib/thinking/types';

export const BASE_SOFT_FLOOR_MINS = 30;

export type SoftCalibration = {
  softFloorMins: number;
  blendScale: number;
  sampleCount: number;
  /** prior | early | forming | established */
  phase: 'prior' | 'early' | 'forming' | 'established';
  explain: string | null;
};

const FLOOR_MIN = 15;
const FLOOR_MAX = 45;

/** Full-strength calibration from this many closed loops. */
export const ESTABLISHED_SAMPLES = 5;
/** First dampened step when we have this many. */
export const EARLY_SAMPLES = 2;

function medianSorted(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function clampFloor(n: number): number {
  return Math.min(FLOOR_MAX, Math.max(FLOOR_MIN, Math.round(n)));
}

/**
 * Blend base toward target by `weight` (0 = keep base, 1 = full target).
 */
function lerp(base: number, target: number, weight: number): number {
  const w = Math.max(0, Math.min(1, weight));
  return base + (target - base) * w;
}

export function learningPhaseFromCount(
  sampleCount: number
): SoftCalibration['phase'] {
  if (sampleCount < EARLY_SAMPLES) return 'prior';
  if (sampleCount < 4) return 'early';
  if (sampleCount < ESTABLISHED_SAMPLES) return 'forming';
  return 'established';
}

/**
 * How strongly to apply evidence at this sample count (0–1).
 * Early month: start learning after 2 Reality Check / completion loops.
 */
export function evidenceWeight(sampleCount: number): number {
  if (sampleCount < EARLY_SAMPLES) return 0;
  if (sampleCount === 2) return 0.25;
  if (sampleCount === 3) return 0.4;
  if (sampleCount === 4) return 0.65;
  return 1;
}

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

  const sampleCount = closed.length;
  const phase = learningPhaseFromCount(sampleCount);
  const weight = evidenceWeight(sampleCount);

  if (weight === 0) {
    return {
      softFloorMins: clampFloor(baseFloor),
      blendScale: 1,
      sampleCount,
      phase,
      explain: null,
    };
  }

  const ratios = closed.map(
    (e) => (e.actual_mins as number) / (e.suggested_mins as number)
  );
  ratios.sort((a, b) => a - b);
  const medianRatio = medianSorted(ratios);

  const lowEstActuals = closed
    .filter(
      (e) =>
        (e.estimated_mins || 0) <= 15 || (e.suggested_mins as number) <= 40
    )
    .map((e) => e.actual_mins as number)
    .sort((a, b) => a - b);

  let targetFloor = baseFloor;
  if (lowEstActuals.length >= 2) {
    const med = medianSorted(lowEstActuals);
    // Pull halfway toward median actual of short tasks (full strength target)
    targetFloor = clampFloor((baseFloor + med) / 2);
  } else if (lowEstActuals.length === 1 && sampleCount >= 3) {
    targetFloor = clampFloor((baseFloor * 2 + lowEstActuals[0]) / 3);
  }

  const softFloorMins = clampFloor(lerp(baseFloor, targetFloor, weight));

  // Full-strength blendScale targets (same thresholds as before)
  let targetBlend = 1;
  if (medianRatio > 1.15) targetBlend = 1.2;
  else if (medianRatio > 1.05) targetBlend = 1.1;
  else if (medianRatio < 0.85) targetBlend = 0.75;
  else if (medianRatio < 0.95) targetBlend = 0.9;

  const blendScale = lerp(1, targetBlend, weight);
  // Keep blendScale in a safe band
  const blendClamped = Math.min(1.25, Math.max(0.7, blendScale));

  let explain: string | null = null;
  if (phase === 'established' || phase === 'forming') {
    const pct = Math.round(medianRatio * 100);
    if (medianRatio > 1.05) {
      explain = `Learned times have been ~${pct - 100}% short — leaning more on history`;
    } else if (medianRatio < 0.95) {
      explain = `Learned times have been ~${100 - pct}% long — leaning less on history`;
    }
  }

  return {
    softFloorMins,
    blendScale: blendClamped,
    sampleCount,
    phase,
    explain,
  };
}
