// lib/thinking/v3/durationModes.ts
//
// Phase 5.5 — multimodal duration representation.
// A single median can hide 25m vs 4h execution modes.

import { median, madScaled, durationFromSamples } from './stats';
import type { DurationDistribution } from './types';

export type DurationMode = {
  centreMins: number;
  weight: number;
  sampleCount: number;
  interval: { low: number; high: number };
};

export type MultimodalDuration = {
  primary: DurationDistribution;
  modes: DurationMode[];
  multimodal: boolean;
  dispersionMins: number | null;
  sampleCount: number;
  warning: string | null;
};

const MIN_SAMPLES_FOR_MODES = 5;
const MODE_SEPARATION_RATIO = 2.5;

export function detectDurationModes(samples: number[]): DurationMode[] {
  const clean = samples.filter((x) => typeof x === 'number' && x > 0).sort((a, b) => a - b);
  if (clean.length < MIN_SAMPLES_FOR_MODES) return [];

  let bestGapIdx = -1;
  let bestGapScore = 0;
  for (let i = 0; i < clean.length - 1; i++) {
    const lo = clean[i];
    const hi = clean[i + 1];
    if (lo <= 0) continue;
    const ratio = hi / lo;
    if (ratio > bestGapScore) {
      bestGapScore = ratio;
      bestGapIdx = i;
    }
  }

  if (bestGapIdx < 0 || bestGapScore < MODE_SEPARATION_RATIO) return [];

  const left = clean.slice(0, bestGapIdx + 1);
  const right = clean.slice(bestGapIdx + 1);
  if (left.length < 2 || right.length < 2) return [];

  const modeFrom = (xs: number[]): DurationMode => {
    const dist = durationFromSamples(xs, 'median');
    const c = dist?.expectedMins ?? Math.round(median(xs) ?? xs[0]);
    return {
      centreMins: c,
      weight: xs.length / clean.length,
      sampleCount: xs.length,
      interval: dist?.interval ?? { low: xs[0], high: xs[xs.length - 1] },
    };
  };

  return [modeFrom(left), modeFrom(right)].sort((a, b) => b.weight - a.weight);
}

export function multimodalDurationFromSamples(
  samples: number[]
): MultimodalDuration {
  const clean = samples.filter((x) => typeof x === 'number' && x > 0);
  const primary =
    durationFromSamples(clean, 'median') ?? {
      expectedMins: 30,
      interval: { low: 15, high: 45 },
      sampleSize: 0,
      method: 'prior' as const,
    };

  const modes = detectDurationModes(clean);
  const multimodal = modes.length >= 2;
  const dispersion = clean.length >= 2 ? madScaled(clean) : null;

  let warning: string | null = null;
  if (multimodal && modes[0] && modes[1]) {
    warning = `Two common durations (~${modes[0].centreMins}m and ~${modes[1].centreMins}m) — single estimate is unreliable`;
  }

  return {
    primary,
    modes,
    multimodal,
    dispersionMins: dispersion == null ? null : Math.round(dispersion),
    sampleCount: clean.length,
    warning,
  };
}
