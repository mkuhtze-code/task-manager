import type { Confidence } from '@/lib/engine';

const rank: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

export function maxConfidence(values: Confidence[]): Confidence {
  if (values.length === 0) return 'low';
  return values.reduce((best, value) => rank[value] > rank[best] ? value : best, 'low' as Confidence);
}

export function minConfidence(values: Confidence[]): Confidence {
  if (values.length === 0) return 'low';
  return values.reduce((best, value) => rank[value] < rank[best] ? value : best, 'high' as Confidence);
}
