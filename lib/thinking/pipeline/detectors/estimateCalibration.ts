// lib/thinking/pipeline/detectors/estimateCalibration.ts
//
// Candidate Detector 1: Estimate Calibration
// Identifies task populations where actual duration consistently differs from estimated duration.

import type { CompletedTaskFacts } from '../../types';
import type { DetectorContext, EngineObservation } from '../types';
import { evaluateEvidenceConfidence } from '../confidence';

export function detectEstimateCalibration(ctx: DetectorContext): EngineObservation[] {
  const observations: EngineObservation[] = [];
  const now = ctx.now || new Date();

  // Evaluate clusters first
  for (const [clusterLabel, facts] of ctx.groupedFacts.entries()) {
    if (clusterLabel === '__unmatched__') continue;

    // Filter tasks that have explicit actual_mins AND estimate_mins > 0
    const valid = facts.filter(
      (f) =>
        f.actual_mins !== null &&
        f.actual_mins > 0 &&
        f.estimate_mins > 0
    );

    if (valid.length < 3) continue;

    let underestimatedCount = 0;
    let overestimatedCount = 0;
    let totalRatioSum = 0;
    let latestCompletedAt: string | null = null;

    for (const f of valid) {
      const ratio = f.actual_mins! / f.estimate_mins;
      totalRatioSum += ratio;

      if (ratio >= 1.25) underestimatedCount++;
      else if (ratio <= 0.75) overestimatedCount++;

      if (f.completed_at) {
        if (!latestCompletedAt || new Date(f.completed_at) > new Date(latestCompletedAt)) {
          latestCompletedAt = f.completed_at;
        }
      }
    }

    const underRatio = underestimatedCount / valid.length;
    const overRatio = overestimatedCount / valid.length;

    // Reject contradictory signal (e.g., both high variance or equal balance)
    if (underRatio >= 0.65 && overRatio < 0.25) {
      const evalResult = evaluateEvidenceConfidence({
        sampleCount: valid.length,
        consistencyRatio: underRatio,
        lastObservedAt: latestCompletedAt,
        now,
      });

      if (evalResult) {
        const avgRatio = totalRatioSum / valid.length;
        observations.push({
          id: `est_calib_under_${clusterLabel.toLowerCase().replace(/\s+/g, '_')}`,
          type: 'estimate_calibration',
          title: `Tasks involving ${clusterLabel} tend to take longer than estimated.`,
          statement: `Tasks in the "${clusterLabel}" group consistently take longer than initial estimates.`,
          explanation: `Based on ${valid.length} completed task${valid.length === 1 ? '' : 's'}, actual duration was on average ${avgRatio.toFixed(1)}x higher than estimated.`,
          evidence: {
            sampleCount: valid.length,
            consistencyRatio: underRatio,
            supportingData: [
              {
                label: `${valid.length} tasks evaluated`,
                metricName: 'underestimate_rate',
                metricValue: `${Math.round(underRatio * 100)}%`,
                sampleCount: valid.length,
              },
              {
                label: 'Average actual/estimated ratio',
                metricName: 'avg_ratio',
                metricValue: `${avgRatio.toFixed(1)}x`,
                sampleCount: valid.length,
              },
            ],
            lastObservedAt: latestCompletedAt || now.toISOString(),
          },
          confidence: evalResult.confidence,
          clusterLabel,
          createdAt: now.toISOString(),
          status: evalResult.status,
        });
      }
    } else if (overRatio >= 0.65 && underRatio < 0.25) {
      const evalResult = evaluateEvidenceConfidence({
        sampleCount: valid.length,
        consistencyRatio: overRatio,
        lastObservedAt: latestCompletedAt,
        now,
      });

      if (evalResult) {
        const avgRatio = totalRatioSum / valid.length;
        observations.push({
          id: `est_calib_over_${clusterLabel.toLowerCase().replace(/\s+/g, '_')}`,
          type: 'estimate_calibration',
          title: `Tasks involving ${clusterLabel} tend to take less time than estimated.`,
          statement: `Tasks in the "${clusterLabel}" group are typically completed faster than initial estimates.`,
          explanation: `Based on ${valid.length} completed task${valid.length === 1 ? '' : 's'}, actual duration was on average ${avgRatio.toFixed(1)}x of estimated time.`,
          evidence: {
            sampleCount: valid.length,
            consistencyRatio: overRatio,
            supportingData: [
              {
                label: `${valid.length} tasks evaluated`,
                metricName: 'overestimate_rate',
                metricValue: `${Math.round(overRatio * 100)}%`,
                sampleCount: valid.length,
              },
              {
                label: 'Average actual/estimated ratio',
                metricName: 'avg_ratio',
                metricValue: `${avgRatio.toFixed(1)}x`,
                sampleCount: valid.length,
              },
            ],
            lastObservedAt: latestCompletedAt || now.toISOString(),
          },
          confidence: evalResult.confidence,
          clusterLabel,
          createdAt: now.toISOString(),
          status: evalResult.status,
        });
      }
    }
  }

  return observations;
}
