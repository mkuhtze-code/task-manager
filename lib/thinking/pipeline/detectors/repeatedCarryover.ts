// lib/thinking/pipeline/detectors/repeatedCarryover.ts
//
// Candidate Detector 2: Repeated Carryover
// Detects tasks or task categories that repeatedly carry over across days before completion.

import type { CompletedTaskFacts } from '../../types';
import type { DetectorContext, EngineObservation } from '../types';
import { evaluateEvidenceConfidence } from '../confidence';

function getUtcDayString(isoStr: string | null): string | null {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function isCarriedOver(fact: CompletedTaskFacts): boolean {
  if (!fact.completed_at) return false;
  const completedDay = getUtcDayString(fact.completed_at);
  if (!completedDay) return false;

  const createdDay = getUtcDayString(fact.created_at);
  const surfaceDay = getUtcDayString(fact.surface_date);

  // If completed on a later day than created_at or surface_date
  if (createdDay && completedDay > createdDay) return true;
  if (surfaceDay && completedDay > surfaceDay) return true;

  return false;
}

export function detectRepeatedCarryover(ctx: DetectorContext): EngineObservation[] {
  const observations: EngineObservation[] = [];
  const now = ctx.now || new Date();

  for (const [clusterLabel, facts] of ctx.groupedFacts.entries()) {
    if (clusterLabel === '__unmatched__') continue;

    // Must have at least 3 completed tasks with completed_at timestamp
    const completedTasks = facts.filter((f) => f.completed_at !== null);
    if (completedTasks.length < 3) continue;

    let carryoverCount = 0;
    let latestCompletedAt: string | null = null;

    for (const f of completedTasks) {
      if (isCarriedOver(f)) {
        carryoverCount++;
      }
      if (!latestCompletedAt || new Date(f.completed_at!) > new Date(latestCompletedAt)) {
        latestCompletedAt = f.completed_at;
      }
    }

    const carryoverRate = carryoverCount / completedTasks.length;

    // High carryover rate signal (>= 60%)
    if (carryoverRate >= 0.6) {
      const evalResult = evaluateEvidenceConfidence({
        sampleCount: completedTasks.length,
        consistencyRatio: carryoverRate,
        lastObservedAt: latestCompletedAt,
        now,
      });

      if (evalResult) {
        observations.push({
          id: `carryover_${clusterLabel.toLowerCase().replace(/\s+/g, '_')}`,
          type: 'repeated_carryover',
          title: `Tasks involving ${clusterLabel} frequently span multiple days.`,
          statement: `Tasks in the "${clusterLabel}" group often carry over beyond their initial scheduled day.`,
          explanation: `${carryoverCount} of ${completedTasks.length} tasks (${Math.round(carryoverRate * 100)}%) carried over past their creation date before completion.`,
          evidence: {
            sampleCount: completedTasks.length,
            consistencyRatio: carryoverRate,
            supportingData: [
              {
                label: `${completedTasks.length} tasks analyzed`,
                metricName: 'carryover_rate',
                metricValue: `${Math.round(carryoverRate * 100)}%`,
                sampleCount: completedTasks.length,
              },
              {
                label: 'Carryover count',
                metricName: 'carryover_count',
                metricValue: carryoverCount,
                sampleCount: completedTasks.length,
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
