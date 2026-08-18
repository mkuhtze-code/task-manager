// lib/thinking/associations/clusterTime.ts
//
// Cluster × Time association: "When does this activity tend to occur?"
//
// Two independent dimensions: period (morning/afternoon/evening/night)
// and day_of_week (Mon–Sun). Each dimension is computed separately.
// They are NOT combined into composite temporal associations.
//
// UTC is the engine convention (matching Scope 3A and the existing
// thinking engine). The UI converts to local time for display.

import type { CompletedTaskFacts } from '../types';
import { classifyConfidence } from '../confidence';
import { extractTemporalContext } from '../relationships/temporal';
import type { ClusterTimeAssociation } from './types';

export const MIN_OBSERVATIONS_FOR_TIME = 3;
export const MIN_RATIO_FOR_TIME = 0.6;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Determine temporal associations for a cluster.
 *
 * Produces associations for two independent dimensions:
 * 1. Period: morning / afternoon / evening / night
 * 2. Day of week: Sun / Mon / ... / Sat
 *
 * Each dimension is evaluated independently. An association is produced
 * when the ratio of observations in a specific period or day meets the
 * threshold.
 *
 * Tasks without valid created_at are counted in totalInCluster but
 * excluded from temporal analysis.
 */
export function findClusterTimeAssociations(
  clusterLabel: string,
  tasks: CompletedTaskFacts[]
): ClusterTimeAssociation[] {
  const totalInCluster = tasks.length;

  const withTimestamp = tasks.filter(
    (t) => t.created_at && !Number.isNaN(new Date(t.created_at).getTime())
  );

  const totalWithTimestamp = withTimestamp.length;
  if (totalWithTimestamp < MIN_OBSERVATIONS_FOR_TIME) return [];

  const associations: ClusterTimeAssociation[] = [];

  // ── Period dimension ──────────────────────────────────────────

  const periodCounts = new Map<string, number>();
  for (const t of withTimestamp) {
    const ctx = extractTemporalContext(t.created_at);
    periodCounts.set(ctx.period, (periodCounts.get(ctx.period) ?? 0) + 1);
  }

  for (const [period, count] of periodCounts) {
    const ratio = count / totalWithTimestamp;
    if (ratio >= MIN_RATIO_FOR_TIME) {
      associations.push({
        kind: 'cluster_time',
        clusterLabel,
        dimension: 'period',
        value: period,
        occurrenceCount: count,
        totalWithTimestamp,
        totalInCluster,
        ratio,
        confidence: classifyConfidence(count),
      });
    }
  }

  // ── Day of week dimension ─────────────────────────────────────

  const dowCounts = new Map<string, number>();
  for (const t of withTimestamp) {
    const ctx = extractTemporalContext(t.created_at);
    const dayName = DAY_NAMES[ctx.dayOfWeek];
    dowCounts.set(dayName, (dowCounts.get(dayName) ?? 0) + 1);
  }

  for (const [day, count] of dowCounts) {
    const ratio = count / totalWithTimestamp;
    if (ratio >= MIN_RATIO_FOR_TIME) {
      associations.push({
        kind: 'cluster_time',
        clusterLabel,
        dimension: 'day_of_week',
        value: day,
        occurrenceCount: count,
        totalWithTimestamp,
        totalInCluster,
        ratio,
        confidence: classifyConfidence(count),
      });
    }
  }

  return associations;
}
