import { describe, it, expect } from 'vitest';
import { computeEffectiveEstimate } from '@/lib/thinking/decisions/effectiveEstimate';

describe('blendScale', () => {
  it('increases lean on learned when blendScale > 1', () => {
    const base = computeEffectiveEstimate({
      typedMins: 30,
      suggestedMins: 60,
      confidence: 'high',
      clusterCount: 10,
      blendScale: 1,
    });
    const scaled = computeEffectiveEstimate({
      typedMins: 30,
      suggestedMins: 60,
      confidence: 'high',
      clusterCount: 10,
      blendScale: 1.25,
    });
    expect(scaled.blendedMins).toBeGreaterThanOrEqual(base.blendedMins);
    expect(scaled.blendWeight).toBeGreaterThan(base.blendWeight);
  });

  it('reduces lean when blendScale < 1', () => {
    const base = computeEffectiveEstimate({
      typedMins: 30,
      suggestedMins: 60,
      confidence: 'high',
      clusterCount: 10,
    });
    const scaled = computeEffectiveEstimate({
      typedMins: 30,
      suggestedMins: 60,
      confidence: 'high',
      clusterCount: 10,
      blendScale: 0.5,
    });
    expect(scaled.blendedMins).toBeLessThanOrEqual(base.blendedMins);
  });
});
