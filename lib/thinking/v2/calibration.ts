import { CompletedTaskFacts } from '../types';
import {
  buildEvidence,
  deriveConfidenceDimensions,
  deriveConfidence,
  median,
  mean,
  iqr,
  effectMagnitudeFromRatio,
  consistencyFromValues,
} from './evidence';
import { observationIdentityKey } from './identity';
import { buildStructuredObservation, StructuredObservation } from './observations';

const MIN_SAMPLES_FOR_CALIBRATION = 3;

export interface EstimateCalibration {
  sampleSize: number;
  medianRatio: number;
  meanRatio: number;
  absoluteMedianDelta: number;
  directionBias: 'over' | 'under' | 'balanced';
  outlierCount: number;
  effectMagnitude: number;
  consistency: number;
  ratios: number[];
}

export function computeEstimateCalibration(tasks: CompletedTaskFacts[]): EstimateCalibration | null {
  const pairs = tasks.filter(
    (t) =>
      t.estimate_mins !== null &&
      t.estimate_mins !== undefined &&
      t.actual_mins !== null &&
      t.actual_mins !== undefined &&
      t.estimate_mins > 0 &&
      t.actual_mins > 0,
  );

  if (pairs.length < MIN_SAMPLES_FOR_CALIBRATION) return null;

  const ratios = pairs.map((t) => t.actual_mins! / t.estimate_mins!);
  const med = median(ratios)!;
  const m = mean(ratios)!;

  const absDeltas = pairs.map((t) => Math.abs(t.actual_mins! - t.estimate_mins!));
  const absMedDelta = median(absDeltas)!;

  const underCount = ratios.filter((r) => r > 1.1).length;
  const overCount = ratios.filter((r) => r < 0.9).length;
  let directionBias: 'over' | 'under' | 'balanced' = 'balanced';
  if (overCount > underCount && overCount >= pairs.length * 0.6) directionBias = 'over';
  if (underCount > overCount && underCount >= pairs.length * 0.6) directionBias = 'under';

  const iqrVal = iqr(ratios);
  const outlierCount = iqrVal !== null
    ? ratios.filter((r) => Math.abs(r - med) > 2 * iqrVal).length
    : 0;

  const effectMag = effectMagnitudeFromRatio(med);
  const consistency = consistencyFromValues(ratios) ?? 0;

  return {
    sampleSize: pairs.length,
    medianRatio: med,
    meanRatio: m,
    absoluteMedianDelta: absMedDelta,
    directionBias,
    outlierCount,
    effectMagnitude: effectMag,
    consistency,
    ratios,
  };
}

export function observeEstimateCalibration(
  tasks: CompletedTaskFacts[],
): StructuredObservation | null {
  const calibration = computeEstimateCalibration(tasks);
  if (!calibration) return null;

  const evidence = buildEvidence({
    sampleSize: calibration.sampleSize,
    values: calibration.ratios,
    recencyDays: null,
    measurements: [{
      medianRatio: calibration.medianRatio,
      meanRatio: calibration.meanRatio,
      directionBias: calibration.directionBias,
      outlierCount: calibration.outlierCount,
    }],
  });

  const confidenceDimensions = deriveConfidenceDimensions(evidence);
  const confidence = deriveConfidence(confidenceDimensions);

  const id = observationIdentityKey({
    type: 'estimate_calibration',
    subType: calibration.directionBias,
  });

  const directionWord = calibration.directionBias === 'over'
    ? 'overestimate'
    : calibration.directionBias === 'under'
      ? 'underestimate'
      : 'be close to actual duration';

  return buildStructuredObservation({
    id,
    type: 'estimate_calibration',
    title: `Estimates tend to ${directionWord}`,
    description:
      `Based on ${calibration.sampleSize} completed tasks with estimates, ` +
      `actual duration is typically ${Math.round(calibration.medianRatio * 100)}% of the estimate ` +
      `(median ratio: ${calibration.medianRatio.toFixed(2)}). ` +
      `Median absolute difference: ${Math.round(calibration.absoluteMedianDelta)} minutes.`,
    evidence,
    confidenceDimensions,
    confidence,
    affectedContext: {},
    traceability: {
      taskIds: [],
      taskTexts: [],
      detectionSource: 'estimateCalibration',
    },
    semanticType: `estimate_calibration:${calibration.directionBias}`,
  });
}
