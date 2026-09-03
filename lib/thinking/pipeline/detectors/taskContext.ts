// lib/thinking/pipeline/detectors/taskContext.ts
//
// Candidate Detector 4: Task-Context Patterns
// Identifies relationships between metadata attributes (location, job, subtasks) and behavior.

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

export function detectTaskContextPatterns(ctx: DetectorContext): EngineObservation[] {
  const observations: EngineObservation[] = [];
  const now = ctx.now || new Date();

  // 1. Analyze location-tagged tasks vs time-of-day
  const locatedTasks = ctx.facts.filter((f) => f.location_text && f.completed_at);
  if (locatedTasks.length >= 4) {
    const periodCounts: Record<TimePeriod, number> = {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    };
    let latestCompletedAt: string | null = null;

    for (const f of locatedTasks) {
      const tempCtx = extractTemporalContext(f.completed_at!);
      periodCounts[tempCtx.period]++;
      if (!latestCompletedAt || new Date(f.completed_at!) > new Date(latestCompletedAt)) {
        latestCompletedAt = f.completed_at;
      }
    }

    for (const p of ['morning', 'afternoon', 'evening', 'night'] as TimePeriod[]) {
      const count = periodCounts[p];
      const ratio = count / locatedTasks.length;

      if (ratio >= 0.7) {
        const evalResult = evaluateEvidenceConfidence({
          sampleCount: locatedTasks.length,
          consistencyRatio: ratio,
          lastObservedAt: latestCompletedAt,
          now,
        });

        if (evalResult) {
          const windowLabel = getTimeOfDayLabel(p);
          observations.push({
            id: `ctx_location_time_${p}`,
            type: 'task_context',
            title: `Location-bound tasks are typically handled ${windowLabel}.`,
            statement: `Tasks with specific locations are usually completed ${windowLabel}.`,
            explanation: `${count} of ${locatedTasks.length} location-tagged tasks (${Math.round(ratio * 100)}%) were completed during ${p} hours.`,
            evidence: {
              sampleCount: locatedTasks.length,
              consistencyRatio: ratio,
              supportingData: [
                {
                  label: `${locatedTasks.length} located tasks`,
                  metricName: 'located_time_ratio',
                  metricValue: `${Math.round(ratio * 100)}%`,
                  sampleCount: locatedTasks.length,
                },
              ],
              lastObservedAt: latestCompletedAt || now.toISOString(),
            },
            confidence: evalResult.confidence,
            createdAt: now.toISOString(),
            status: evalResult.status,
          });
        }
        break;
      }
    }
  }

  // 2. Analyze impact of subtask breakdown on task completion / duration
  const tasksWithSubtasks = ctx.facts.filter((f) => f.subtaskCount > 0 && f.actual_mins !== null);
  const tasksWithoutSubtasks = ctx.facts.filter((f) => f.subtaskCount === 0 && f.actual_mins !== null);

  if (tasksWithSubtasks.length >= 4 && tasksWithoutSubtasks.length >= 4) {
    const avgSubMins =
      tasksWithSubtasks.reduce((sum, f) => sum + f.actual_mins!, 0) / tasksWithSubtasks.length;
    const avgNoSubMins =
      tasksWithoutSubtasks.reduce((sum, f) => sum + f.actual_mins!, 0) / tasksWithoutSubtasks.length;

    if (avgNoSubMins > 0 && avgSubMins / avgNoSubMins >= 1.75) {
      let latestCompletedAt: string | null = null;
      for (const f of tasksWithSubtasks) {
        if (f.completed_at && (!latestCompletedAt || new Date(f.completed_at) > new Date(latestCompletedAt))) {
          latestCompletedAt = f.completed_at;
        }
      }

      const ratio = avgSubMins / avgNoSubMins;
      const evalResult = evaluateEvidenceConfidence({
        sampleCount: tasksWithSubtasks.length,
        consistencyRatio: Math.min(1.0, ratio / 2), // Normalized confidence signal
        lastObservedAt: latestCompletedAt,
        now,
      });

      if (evalResult) {
        observations.push({
          id: `ctx_subtask_duration_impact`,
          type: 'task_context',
          title: 'Tasks broken down into subtasks represent larger focus blocks.',
          statement: 'Tasks with subtasks take significantly longer than single-step tasks.',
          explanation: `Tasks with subtasks average ${Math.round(avgSubMins)}m compared to ${Math.round(avgNoSubMins)}m for simple tasks.`,
          evidence: {
            sampleCount: tasksWithSubtasks.length,
            consistencyRatio: Math.min(1.0, ratio / 2),
            supportingData: [
              {
                label: 'Avg duration with subtasks',
                metricName: 'avg_subtask_mins',
                metricValue: `${Math.round(avgSubMins)}m`,
                sampleCount: tasksWithSubtasks.length,
              },
              {
                label: 'Avg duration without subtasks',
                metricName: 'avg_simple_mins',
                metricValue: `${Math.round(avgNoSubMins)}m`,
                sampleCount: tasksWithoutSubtasks.length,
              },
            ],
            lastObservedAt: latestCompletedAt || now.toISOString(),
          },
          confidence: evalResult.confidence,
          createdAt: now.toISOString(),
          status: evalResult.status,
        });
      }
    }
  }

  return observations;
}
