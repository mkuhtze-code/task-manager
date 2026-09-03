// lib/thinking/pipeline/detectors/timeOfDay.ts
//
// Candidate Detector 3: Time-of-Day Patterns
// Identifies relationships between task characteristics and completion time windows.

import type { CompletedTaskFacts } from '../../types';
import type { DetectorContext, EngineObservation } from '../types';
import { evaluateEvidenceConfidence } from '../confidence';
import { extractTemporalContext, TimePeriod } from '../../relationships/temporal';

function getTimeOfDayLabel(period: TimePeriod): string {
  switch (period) {
    case 'morning':
      return 'in the morning';
    case 'afternoon':
      return 'in the afternoon';
    case 'evening':
      return 'in the evening';
    case 'night':
      return 'at night';
  }
}

export function detectTimeOfDayPatterns(ctx: DetectorContext): EngineObservation[] {
  const observations: EngineObservation[] = [];
  const now = ctx.now || new Date();

  // 1. Analyze short admin/quick tasks (<= 15 mins)
  const shortTasks = ctx.facts.filter((f) => {
    if (!f.completed_at) return false;
    const dur = f.actual_mins ?? f.estimate_mins;
    return dur > 0 && dur <= 15;
  });

  if (shortTasks.length >= 4) {
    const periodCounts: Record<TimePeriod, number> = {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    };
    let latestCompletedAt: string | null = null;

    for (const f of shortTasks) {
      const tempCtx = extractTemporalContext(f.completed_at!);
      periodCounts[tempCtx.period]++;
      if (!latestCompletedAt || new Date(f.completed_at!) > new Date(latestCompletedAt)) {
        latestCompletedAt = f.completed_at;
      }
    }

    for (const p of ['morning', 'afternoon', 'evening', 'night'] as TimePeriod[]) {
      const count = periodCounts[p];
      const ratio = count / shortTasks.length;

      if (ratio >= 0.65) {
        const evalResult = evaluateEvidenceConfidence({
          sampleCount: shortTasks.length,
          consistencyRatio: ratio,
          lastObservedAt: latestCompletedAt,
          now,
        });

        if (evalResult) {
          const windowLabel = getTimeOfDayLabel(p);
          observations.push({
            id: `tod_short_tasks_${p}`,
            type: 'time_of_day',
            title: `Short tasks (15m or less) are usually completed ${windowLabel}.`,
            statement: `You tend to complete quick tasks (${windowLabel}).`,
            explanation: `${count} of ${shortTasks.length} short tasks (${Math.round(ratio * 100)}%) were finished during ${p} hours.`,
            evidence: {
              sampleCount: shortTasks.length,
              consistencyRatio: ratio,
              supportingData: [
                {
                  label: `${shortTasks.length} short tasks analyzed`,
                  metricName: 'window_completion_rate',
                  metricValue: `${Math.round(ratio * 100)}%`,
                  sampleCount: shortTasks.length,
                },
                {
                  label: 'Dominant window',
                  metricName: 'period',
                  metricValue: p,
                  sampleCount: count,
                },
              ],
              lastObservedAt: latestCompletedAt || now.toISOString(),
            },
            confidence: evalResult.confidence,
            createdAt: now.toISOString(),
            status: evalResult.status,
          });
        }
        break; // Only emit dominant period
      }
    }
  }

  // 2. Analyze cluster-specific completion times
  for (const [clusterLabel, facts] of ctx.groupedFacts.entries()) {
    if (clusterLabel === '__unmatched__') continue;

    const clusterWithComp = facts.filter((f) => f.completed_at !== null);
    if (clusterWithComp.length < 4) continue;

    const periodCounts: Record<TimePeriod, number> = {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    };
    let latestCompletedAt: string | null = null;

    for (const f of clusterWithComp) {
      const tempCtx = extractTemporalContext(f.completed_at!);
      periodCounts[tempCtx.period]++;
      if (!latestCompletedAt || new Date(f.completed_at!) > new Date(latestCompletedAt)) {
        latestCompletedAt = f.completed_at;
      }
    }

    for (const p of ['morning', 'afternoon', 'evening', 'night'] as TimePeriod[]) {
      const count = periodCounts[p];
      const ratio = count / clusterWithComp.length;

      if (ratio >= 0.65) {
        const evalResult = evaluateEvidenceConfidence({
          sampleCount: clusterWithComp.length,
          consistencyRatio: ratio,
          lastObservedAt: latestCompletedAt,
          now,
        });

        if (evalResult) {
          const windowLabel = getTimeOfDayLabel(p);
          observations.push({
            id: `tod_cluster_${clusterLabel.toLowerCase().replace(/\s+/g, '_')}_${p}`,
            type: 'time_of_day',
            title: `Tasks involving ${clusterLabel} are usually completed ${windowLabel}.`,
            statement: `Work in "${clusterLabel}" is predominantly completed ${windowLabel}.`,
            explanation: `${count} of ${clusterWithComp.length} completed tasks in this group (${Math.round(ratio * 100)}%) were finished during ${p} hours.`,
            evidence: {
              sampleCount: clusterWithComp.length,
              consistencyRatio: ratio,
              supportingData: [
                {
                  label: `${clusterWithComp.length} tasks analyzed`,
                  metricName: 'window_completion_rate',
                  metricValue: `${Math.round(ratio * 100)}%`,
                  sampleCount: clusterWithComp.length,
                },
                {
                  label: 'Dominant window',
                  metricName: 'period',
                  metricValue: p,
                  sampleCount: count,
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
        break;
      }
    }
  }

  return observations;
}
