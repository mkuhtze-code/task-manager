/**
 * S2 / WS-C — Triple calibration.
 *
 * Three permanent metrics (never conflated):
 *
 *   1. Model MALE   — |log(actual / suggestion)| on clean_done only
 *   2. Intent residual — |log(actual / typedEstimate)| on clean_done
 *   3. Override rate — fraction of captures where typed differs from suggestion
 *
 * Tuning model quality must not be achievable by suppressing overrides or
 * training on dirty paths. Intent residual updates estimate-bias only.
 *
 * Pure. Deterministic. Privacy-preserving (in-process aggregates).
 */

import {
  calibrateFromPairs,
  logRatio,
  type CalibrationPair,
  type CalibrationReport,
} from './calibrationMetrics';
import { median } from './stats';
import { type HorizonDays } from './calibrationHarness';

/** Relative difference beyond which typed counts as an override of suggestion. */
export const OVERRIDE_RELATIVE_EPSILON = 0.15;

export type TrainingChannelTag =
  | 'clean_done'
  | 'partial'
  | 'carry'
  | 'interrupted'
  | 'skip'
  | 'unknown';

export type TripleCalibrationPair = {
  suggestionMins: number;
  typedMins: number | null;
  actualMins: number;
  completedAt: string;
  channel: TrainingChannelTag;
  workKey?: string | null;
  clusterKey?: string | null;
  overridden?: boolean | null;
};

export type HorizonTriple = {
  horizonDays: HorizonDays;
  model: CalibrationReport;
  intent: CalibrationReport;
  overrideRate: number | null;
  cleanPairCount: number;
  overrideDenom: number;
};

export type TripleCalibrationProgression = {
  asOf: string;
  day7: HorizonTriple;
  day14: HorizonTriple;
  day30: HorizonTriple;
  improvingModel: boolean | null;
  reasons: string[];
};

function parseTime(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function isCleanDoneChannel(channel: TrainingChannelTag): boolean {
  return channel === 'clean_done';
}

export function isOverride(
  typedMins: number | null | undefined,
  suggestionMins: number,
  eps: number = OVERRIDE_RELATIVE_EPSILON
): boolean {
  if (typedMins == null || !(typedMins > 0) || !(suggestionMins > 0)) {
    return false;
  }
  return Math.abs(typedMins - suggestionMins) / suggestionMins > eps;
}

export function modelPairsFromTriple(
  pairs: TripleCalibrationPair[]
): CalibrationPair[] {
  return pairs
    .filter(
      (p) =>
        isCleanDoneChannel(p.channel) &&
        p.actualMins > 0 &&
        p.suggestionMins > 0
    )
    .map((p) => ({
      predictedMins: p.suggestionMins,
      actualMins: p.actualMins,
    }));
}

export function intentPairsFromTriple(
  pairs: TripleCalibrationPair[]
): CalibrationPair[] {
  return pairs
    .filter(
      (p) =>
        isCleanDoneChannel(p.channel) &&
        p.actualMins > 0 &&
        p.typedMins != null &&
        p.typedMins > 0
    )
    .map((p) => ({
      predictedMins: p.typedMins as number,
      actualMins: p.actualMins,
    }));
}

export function overrideRateFromPairs(
  pairs: TripleCalibrationPair[],
  eps: number = OVERRIDE_RELATIVE_EPSILON
): { rate: number | null; denom: number } {
  const eligible = pairs.filter(
    (p) =>
      p.suggestionMins > 0 &&
      p.typedMins != null &&
      (p.typedMins as number) > 0
  );
  if (eligible.length === 0) return { rate: null, denom: 0 };
  const overs = eligible.filter((p) => {
    if (p.overridden === true) return true;
    if (p.overridden === false) return false;
    return isOverride(p.typedMins, p.suggestionMins, eps);
  });
  return { rate: overs.length / eligible.length, denom: eligible.length };
}

function pairsInHorizonTriple(
  pairs: TripleCalibrationPair[],
  asOf: string | Date,
  horizonDays: number
): TripleCalibrationPair[] {
  const end =
    typeof asOf === 'string' ? parseTime(asOf) : (asOf as Date).getTime();
  if (!end) return [];
  const start = end - horizonDays * 24 * 60 * 60 * 1000;
  return pairs.filter((p) => {
    const t = parseTime(p.completedAt);
    return t >= start && t <= end;
  });
}

export function tripleAtHorizon(
  pairs: TripleCalibrationPair[],
  asOf: string | Date,
  horizonDays: HorizonDays
): HorizonTriple {
  const windowed = pairsInHorizonTriple(pairs, asOf, horizonDays);
  const model = calibrateFromPairs(modelPairsFromTriple(windowed));
  const intent = calibrateFromPairs(intentPairsFromTriple(windowed));
  const { rate, denom } = overrideRateFromPairs(windowed);
  return {
    horizonDays,
    model,
    intent,
    overrideRate: rate,
    cleanPairCount: model.sampleCount,
    overrideDenom: denom,
  };
}

export function tripleCalibrationProgression(
  pairs: TripleCalibrationPair[],
  asOf: string | Date
): TripleCalibrationProgression {
  const asOfIso =
    typeof asOf === 'string' ? asOf : (asOf as Date).toISOString();
  const day7 = tripleAtHorizon(pairs, asOf, 7);
  const day14 = tripleAtHorizon(pairs, asOf, 14);
  const day30 = tripleAtHorizon(pairs, asOf, 30);
  const reasons: string[] = [];

  const a = day7.model.male;
  const b = day30.model.male;
  let improvingModel: boolean | null = null;
  if (
    a != null &&
    b != null &&
    day7.cleanPairCount >= 3 &&
    day30.cleanPairCount >= 5
  ) {
    improvingModel = b < a - 0.02;
    reasons.push(
      improvingModel
        ? 'model MALE tighter at day30 vs day7'
        : 'model MALE not yet tighter at day30 vs day7'
    );
  } else {
    reasons.push('insufficient clean pairs to judge model improvement');
  }

  if (day30.overrideRate != null) {
    reasons.push(
      `override rate day30=${(day30.overrideRate * 100).toFixed(0)}% (not optimised away)`
    );
  }

  return {
    asOf: asOfIso,
    day7,
    day14,
    day30,
    improvingModel,
    reasons,
  };
}

export function intentResidualBias(
  pairs: TripleCalibrationPair[]
): {
  medianLogResidual: number | null;
  sampleCount: number;
  typedToActualScale: number | null;
  reasons: string[];
} {
  const clean = pairs.filter(
    (p) =>
      isCleanDoneChannel(p.channel) &&
      p.typedMins != null &&
      (p.typedMins as number) > 0 &&
      p.actualMins > 0
  );
  const logs = clean
    .map((p) => logRatio(p.actualMins, p.typedMins as number))
    .filter((x): x is number => x != null);
  if (logs.length < 2) {
    return {
      medianLogResidual: null,
      sampleCount: logs.length,
      typedToActualScale: null,
      reasons: ['insufficient intent residuals'],
    };
  }
  const med = median(logs);
  return {
    medianLogResidual: med,
    sampleCount: logs.length,
    typedToActualScale: med == null ? null : Math.exp(med),
    reasons: [
      med != null && med > 0.05
        ? 'user tends to underestimate (intent residual)'
        : med != null && med < -0.05
          ? 'user tends to overestimate (intent residual)'
          : 'intent residual near neutral',
    ],
  };
}

export function modelOnlyProgressionFromLegacy(
  pairs: Array<{
    predictedMins: number;
    actualMins: number;
    completedAt: string;
  }>,
  asOf: string | Date
): TripleCalibrationProgression {
  const triple: TripleCalibrationPair[] = pairs.map((p) => ({
    suggestionMins: p.predictedMins,
    typedMins: null,
    actualMins: p.actualMins,
    completedAt: p.completedAt,
    channel: 'clean_done',
  }));
  return tripleCalibrationProgression(triple, asOf);
}
