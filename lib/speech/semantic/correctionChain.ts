/**
 * Ordered correction history — not a single original→final collapse.
 */

import type { CorrectionSpan } from '../types';
import type { CorrectionStep } from './types';

export function buildCorrectionChain(corrections: CorrectionSpan[]): CorrectionStep[] {
  return corrections.map((c, i) => ({
    from: c.originalRaw,
    to: c.correctedRaw,
    marker: c.marker,
    facet: c.facet,
    order: i,
  }));
}

export function finalAfterChain(
  chain: CorrectionStep[],
  facet: CorrectionStep['facet']
): string | null {
  const steps = chain.filter((s) => s.facet === facet);
  if (steps.length === 0) return null;
  return steps[steps.length - 1].to;
}

export function isDiscourseActually(text: string): boolean {
  return /^\s*actually\b[,.]?\s+/i.test(text.trim());
}
