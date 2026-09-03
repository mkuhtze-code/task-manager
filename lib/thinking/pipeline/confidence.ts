// lib/thinking/pipeline/confidence.ts
//
// Evidence confidence & strength evaluator for Thinking Engine V2.

import type { Confidence } from '../types';

export const MIN_PIPELINE_SAMPLE_SIZE = 3;
export const MIN_PIPELINE_CONSISTENCY = 0.6;
export const STALE_DAYS_THRESHOLD = 90;

export function evaluateEvidenceConfidence(params: {
  sampleCount: number;
  consistencyRatio: number;
  lastObservedAt?: string | null;
  now?: Date;
}): { confidence: Confidence; status: 'active' | 'stale' } | null {
  const { sampleCount, consistencyRatio, lastObservedAt, now = new Date() } = params;

  if (sampleCount < MIN_PIPELINE_SAMPLE_SIZE) {
    return null; // Insufficient evidence
  }

  if (consistencyRatio < MIN_PIPELINE_CONSISTENCY) {
    return null; // Contradictory / inconsistent evidence
  }

  let confidence: Confidence = 'low';

  if (sampleCount >= 10 && consistencyRatio >= 0.75) {
    confidence = 'high';
  } else if (sampleCount >= 6 && consistencyRatio >= 0.65) {
    confidence = 'medium';
  } else if (sampleCount >= 4 && consistencyRatio >= 0.7) {
    confidence = 'medium';
  }

  let status: 'active' | 'stale' = 'active';
  if (lastObservedAt) {
    const lastDate = new Date(lastObservedAt);
    if (!Number.isNaN(lastDate.getTime())) {
      const diffMs = now.getTime() - lastDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > STALE_DAYS_THRESHOLD) {
        status = 'stale';
      }
    }
  }

  return { confidence, status };
}
