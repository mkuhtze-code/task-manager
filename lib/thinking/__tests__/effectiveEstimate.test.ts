// lib/thinking/__tests__/effectiveEstimate.test.ts
import { describe, it, expect } from 'vitest';
import {
  hasMeaningfulDivergence,
  computeEffectiveEstimate,
  effectiveEstimate,
} from '../decisions/effectiveEstimate';
import { BLEND_WEIGHTS } from '../confidence';

describe('hasMeaningfulDivergence', () => {
  it('returns false when difference is less than 5 minutes', () => {
    expect(hasMeaningfulDivergence(30, 34)).toBe(false);
  });

  it('returns false when difference is small relative to estimate', () => {
    // 100 typed, 114 suggested → diff=14, but 14/100=0.14 < 0.15
    expect(hasMeaningfulDivergence(100, 114)).toBe(false);
  });

  it('returns true when difference is >= 5 and >= 15%', () => {
    // 30 typed, 40 suggested → diff=10, 10/30=0.33
    expect(hasMeaningfulDivergence(30, 40)).toBe(true);
  });

  it('returns true for large divergence', () => {
    // 15 typed, 60 suggested → diff=45, 45/15=3.0
    expect(hasMeaningfulDivergence(15, 60)).toBe(true);
  });

  it('handles zero estimate gracefully', () => {
    // 0 typed, 10 suggested → 10/1 = 10 >= 0.15
    expect(hasMeaningfulDivergence(0, 10)).toBe(true);
  });

  it('handles exact match', () => {
    expect(hasMeaningfulDivergence(30, 30)).toBe(false);
  });
});

describe('computeEffectiveEstimate', () => {
  it('returns typedMins when no suggestion', () => {
    const decision = computeEffectiveEstimate({
      typedMins: 30,
      suggestedMins: null,
      confidence: 'low',
      clusterCount: 0,
    });
    expect(decision.blendedMins).toBe(30);
    expect(decision.blendWeight).toBe(0);
  });

  it('returns typedMins when clusterCount < MIN_SAMPLES', () => {
    const decision = computeEffectiveEstimate({
      typedMins: 30,
      suggestedMins: 60,
      confidence: 'low',
      clusterCount: 1,
    });
    expect(decision.blendedMins).toBe(30);
    expect(decision.blendWeight).toBe(0);
  });

  it('returns typedMins when divergence is not meaningful', () => {
    const decision = computeEffectiveEstimate({
      typedMins: 30,
      suggestedMins: 34,
      confidence: 'medium',
      clusterCount: 5,
    });
    expect(decision.blendedMins).toBe(30);
    expect(decision.blendWeight).toBe(0);
  });

  it('blends with low confidence (25% weight on suggestion)', () => {
    const decision = computeEffectiveEstimate({
      typedMins: 30,
      suggestedMins: 60,
      confidence: 'low',
      clusterCount: 2,
    });
    // 30 * 0.75 + 60 * 0.25 = 22.5 + 15 = 37.5 → 38
    expect(decision.blendedMins).toBe(38);
    expect(decision.blendWeight).toBe(BLEND_WEIGHTS.low);
    expect(decision.confidence).toBe('low');
  });

  it('blends with medium confidence (50% weight on suggestion)', () => {
    const decision = computeEffectiveEstimate({
      typedMins: 30,
      suggestedMins: 60,
      confidence: 'medium',
      clusterCount: 5,
    });
    // 30 * 0.5 + 60 * 0.5 = 15 + 30 = 45
    expect(decision.blendedMins).toBe(45);
    expect(decision.blendWeight).toBe(BLEND_WEIGHTS.medium);
  });

  it('blends with high confidence (75% weight on suggestion)', () => {
    const decision = computeEffectiveEstimate({
      typedMins: 30,
      suggestedMins: 60,
      confidence: 'high',
      clusterCount: 10,
    });
    // 30 * 0.25 + 60 * 0.75 = 7.5 + 45 = 52.5 → 53
    expect(decision.blendedMins).toBe(53);
    expect(decision.blendWeight).toBe(BLEND_WEIGHTS.high);
  });

  it('rounds the blended result', () => {
    const decision = computeEffectiveEstimate({
      typedMins: 25,
      suggestedMins: 50,
      confidence: 'medium',
      clusterCount: 4,
    });
    // 25 * 0.5 + 50 * 0.5 = 12.5 + 25 = 37.5 → 38
    expect(decision.blendedMins).toBe(38);
  });

  it('carries full context in the decision', () => {
    const decision = computeEffectiveEstimate({
      typedMins: 20,
      suggestedMins: 45,
      confidence: 'medium',
      clusterCount: 5,
    });
    expect(decision.kind).toBe('effective_estimate');
    expect(decision.typedMins).toBe(20);
    expect(decision.suggestedMins).toBe(45);
    expect(decision.clusterCount).toBe(5);
    expect(decision.divergence).toBe(25);
  });
});

describe('effectiveEstimate (backward-compatible wrapper)', () => {
  it('returns typedMins when no suggestion', () => {
    expect(effectiveEstimate(30, null)).toBe(30);
  });

  it('returns typedMins when divergence is not meaningful', () => {
    expect(effectiveEstimate(30, { suggestedMins: 34, confidence: 'medium', sampleCount: 5 })).toBe(30);
  });

  it('blends when divergence is meaningful', () => {
    // 30 typed, 60 suggested, medium → 45
    expect(effectiveEstimate(30, { suggestedMins: 60, confidence: 'medium', sampleCount: 5 })).toBe(45);
  });

  it('returns typedMins when sampleCount is too low', () => {
    expect(effectiveEstimate(30, { suggestedMins: 60, confidence: 'low', sampleCount: 1 })).toBe(30);
  });
});
