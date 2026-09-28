import { describe, it, expect } from 'vitest';
import {
  priorStrengthForCleanN,
  authorityFromCleanN,
} from '../learningRates';
import { DEFAULT_PRIOR_STRENGTH } from '../model';

describe('FP-1 learning rates', () => {
  it('aggressive prior strength for clean n 2–5', () => {
    expect(priorStrengthForCleanN(2)).toBeLessThan(DEFAULT_PRIOR_STRENGTH);
    expect(priorStrengthForCleanN(5)).toBeLessThan(DEFAULT_PRIOR_STRENGTH);
    expect(priorStrengthForCleanN(3)).toBe(1.15);
  });

  it('first sample is moderate, not aggressive', () => {
    expect(priorStrengthForCleanN(1)).toBe(4);
    expect(priorStrengthForCleanN(1)).toBeGreaterThan(priorStrengthForCleanN(3));
  });

  it('established uses default strength', () => {
    expect(priorStrengthForCleanN(12)).toBe(DEFAULT_PRIOR_STRENGTH);
  });

  it('authority bands match brief', () => {
    expect(authorityFromCleanN(0)).toBe('unknown');
    expect(authorityFromCleanN(1)).toBe('early');
    expect(authorityFromCleanN(2)).toBe('early');
    expect(authorityFromCleanN(4)).toBe('forming');
    expect(authorityFromCleanN(8)).toBe('established');
    expect(authorityFromCleanN(8, { contested: true })).toBe('contested');
  });
});
