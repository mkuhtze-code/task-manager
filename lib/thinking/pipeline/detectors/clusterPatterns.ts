// lib/thinking/pipeline/detectors/clusterPatterns.ts
//
// Candidate Detector 5: Cluster-Based Patterns
// Evaluates clusters for multi-dimensional traits (associations with place, job, duration stability).

import type { CompletedTaskFacts } from '../../types';
import type { DetectorContext, EngineObservation } from '../types';
import { evaluateEvidenceConfidence } from '../confidence';
import { findClusterPlaceAssociations } from '../../associations/clusterPlace';
import { findClusterJobAssociations } from '../../associations/clusterJob';

export function detectClusterPatterns(ctx: DetectorContext): EngineObservation[] {
  const observations: EngineObservation[] = [];
  const now = ctx.now || new Date();

  for (const [clusterLabel, facts] of ctx.groupedFacts.entries()) {
    if (clusterLabel === '__unmatched__') continue;
    if (facts.length < 3) continue;

    const placeAssocs = findClusterPlaceAssociations(clusterLabel, facts);
    const jobAssocs = findClusterJobAssociations(clusterLabel, facts);

    let latestCompletedAt: string | null = null;
    let actualDurationSum = 0;
    let actualDurationCount = 0;

    for (const f of facts) {
      if (f.actual_mins !== null && f.actual_mins > 0) {
        actualDurationSum += f.actual_mins;
        actualDurationCount++;
      }
      if (f.completed_at) {
        if (!latestCompletedAt || new Date(f.completed_at) > new Date(latestCompletedAt)) {
          latestCompletedAt = f.completed_at;
        }
      }
    }

    const placeAssoc = placeAssocs.length > 0 ? placeAssocs[0] : null;
    const jobAssoc = jobAssocs.length > 0 ? jobAssocs[0] : null;

    if (placeAssoc || jobAssoc) {
      const jobRatio = jobAssoc
        ? jobAssoc.evidence.direct.total > 0
          ? jobAssoc.evidence.direct.count / jobAssoc.evidence.direct.total
          : 0.6
        : 0;

      const consistencyRatio = Math.max(
        placeAssoc ? placeAssoc.ratio : 0,
        jobRatio
      );

      const evalResult = evaluateEvidenceConfidence({
        sampleCount: facts.length,
        consistencyRatio,
        lastObservedAt: latestCompletedAt,
        now,
      });

      if (evalResult) {
        const details: string[] = [];
        if (placeAssoc) {
          details.push(`usually at ${placeAssoc.locationText}`);
        }
        if (jobAssoc) {
          details.push(`linked to job context`);
        }
        if (actualDurationCount >= 3) {
          const avgMins = Math.round(actualDurationSum / actualDurationCount);
          details.push(`typically ~${avgMins}m`);
        }

        observations.push({
          id: `cluster_assoc_${clusterLabel.toLowerCase().replace(/\s+/g, '_')}`,
          type: 'cluster_pattern',
          title: `Recurring context pattern for ${clusterLabel}.`,
          statement: `Tasks in "${clusterLabel}" show consistent contextual patterns (${details.join(', ')}).`,
          explanation: `Analyzed ${facts.length} completed tasks in "${clusterLabel}". Demonstrated strong context association.`,
          evidence: {
            sampleCount: facts.length,
            consistencyRatio,
            supportingData: [
              {
                label: `${facts.length} completions`,
                metricName: 'cluster_sample_count',
                metricValue: facts.length,
                sampleCount: facts.length,
              },
              ...(placeAssoc
                ? [
                    {
                      label: `Location: ${placeAssoc.locationText}`,
                      metricName: 'place_ratio',
                      metricValue: `${Math.round(placeAssoc.ratio * 100)}%`,
                      sampleCount: placeAssoc.occurrenceCount,
                    },
                  ]
                : []),
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
