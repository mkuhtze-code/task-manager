import { describe, it, expect } from 'vitest';
import {
  isOverride,
  modelPairsFromTriple,
  intentPairsFromTriple,
  overrideRateFromPairs,
  tripleCalibrationProgression,
  intentResidualBias,
  type TripleCalibrationPair,
} from '../tripleCalibration';

function day(offset: number): string {
  const d = new Date('2026-01-01T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString();
}

describe('S2 triple calibration', () => {
  it('separates model pairs from intent pairs', () => {
    const pairs: TripleCalibrationPair[] = [
      {
        suggestionMins: 30,
        typedMins: 20,
        actualMins: 40,
        completedAt: day(1),
        channel: 'clean_done',
      },
      {
        suggestionMins: 30,
        typedMins: 30,
        actualMins: 10,
        completedAt: day(2),
        channel: 'interrupted',
      },
    ];
    const model = modelPairsFromTriple(pairs);
    const intent = intentPairsFromTriple(pairs);
    expect(model).toHaveLength(1);
    expect(model[0].predictedMins).toBe(30);
    expect(intent).toHaveLength(1);
    expect(intent[0].predictedMins).toBe(20);
  });

  it('override rate does not require clean_done', () => {
    const pairs: TripleCalibrationPair[] = [
      {
        suggestionMins: 30,
        typedMins: 50,
        actualMins: 40,
        completedAt: day(1),
        channel: 'clean_done',
      },
      {
        suggestionMins: 30,
        typedMins: 31,
        actualMins: 30,
        completedAt: day(2),
        channel: 'carry',
      },
    ];
    const { rate, denom } = overrideRateFromPairs(pairs);
    expect(denom).toBe(2);
    expect(rate).toBe(0.5); // only first exceeds 15%
  });

  it('isOverride respects epsilon', () => {
    expect(isOverride(30, 30)).toBe(false);
    expect(isOverride(34, 30)).toBe(false); // ~13%
    expect(isOverride(40, 30)).toBe(true);
  });

  it('wild estimator: model can improve while intent residual stays large', () => {
    const pairs: TripleCalibrationPair[] = [];
    // Early: suggestion weak (=typed), later: suggestion closer to truth
    for (let i = 0; i < 8; i++) {
      pairs.push({
        suggestionMins: i < 4 ? 15 : 40,
        typedMins: 15,
        actualMins: 40,
        completedAt: day(i),
        channel: 'clean_done',
      });
    }
    const prog = tripleCalibrationProgression(pairs, day(10));
    expect(prog.day30.model.sampleCount).toBeGreaterThanOrEqual(5);
    // Intent residual should show systematic under-estimate
    const bias = intentResidualBias(pairs);
    expect(bias.medianLogResidual).not.toBeNull();
    expect(bias.medianLogResidual!).toBeGreaterThan(0.5);
  });

  it('dirty channels never enter model MALE', () => {
    const pairs: TripleCalibrationPair[] = [
      {
        suggestionMins: 30,
        typedMins: 30,
        actualMins: 5,
        completedAt: day(1),
        channel: 'interrupted',
      },
      {
        suggestionMins: 30,
        typedMins: 30,
        actualMins: 0,
        completedAt: day(2),
        channel: 'clean_done', // actual 0 filtered by calibrate
      },
    ];
    expect(modelPairsFromTriple(pairs)).toHaveLength(0);
  });
});

