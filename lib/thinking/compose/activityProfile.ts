// lib/thinking/compose/activityProfile.ts
//
// Compose all behavioural observations into a single ActivityProfile
// per cluster. This is the top-level entry point for the thinking
// engine's understanding of "how does this kind of work behave?"
//
// Takes a map of cluster labels → their tasks, and produces one
// ActivityProfile per cluster with enough evidence-backed characteristics
// to eventually drive decisions.

import type {
  CompletedTaskFacts,
  ActivityProfile,
  Confidence,
} from '../types';
import { classifyConfidence } from '../confidence';
import { observeLifecycle } from '../observations/taskLifecycle';
import { observeDecomposition } from '../observations/decomposition';
import { observeStaleness } from '../observations/staleness';
import { observePlanning } from '../observations/planningBehaviour';

const MS_PER_DAY = 86_400_000;

export function buildActivityProfile(
  clusterLabel: string,
  tasks: CompletedTaskFacts[],
  now: Date = new Date()
): ActivityProfile | null {
  if (tasks.length === 0) return null;

  const lifecycle = observeLifecycle(tasks);
  const decomposition = observeDecomposition(tasks);
  const staleness = observeStaleness(tasks, now);
  const planning = observePlanning(tasks);

  // Duration — average actual_mins, falling back to estimate_mins
  let totalMins = 0;
  for (const t of tasks) {
    totalMins += t.actual_mins ?? t.estimate_mins;
  }

  // Trend detection — compare first half to second half of completions
  const completed = tasks
    .filter((t) => t.completed_at && t.actual_mins != null)
    .sort((a, b) => new Date(a.completed_at!).getTime() - new Date(b.completed_at!).getTime());

  let trend: 'stable' | 'improving' | 'worsening' = 'stable';
  if (completed.length >= 3) {
    const mid = Math.floor(completed.length / 2);
    const firstHalf = completed.slice(0, mid);
    const secondHalf = completed.slice(mid);
    const avgFirst = firstHalf.reduce((s, t) => s + (t.actual_mins ?? 0), 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, t) => s + (t.actual_mins ?? 0), 0) / secondHalf.length;
    if (avgFirst > 0) {
      const change = (avgSecond - avgFirst) / avgFirst;
      if (Math.abs(change) >= 0.10) {
        trend = change < 0 ? 'improving' : 'worsening';
      }
    }
  }

  const confidence = classifyConfidence(tasks.length);

  return {
    clusterLabel,
    count: tasks.length,
    confidence,
    avgDaysToCompletion: lifecycle?.avgDaysToCompletion ?? 0,
    sameDayRate: lifecycle?.sameDayRate ?? 0,
    carryoverRate: lifecycle?.carryoverRate ?? 0,
    decomposeRate: decomposition?.decomposeRate ?? 0,
    avgSubtaskCount: decomposition?.avgSubtaskCount ?? 0,
    cameUpRate: planning?.cameUpRate ?? 0,
    estimatedRate: planning?.estimatedRate ?? 0,
    locatedRate: planning?.locatedRate ?? 0,
    jobRate: planning?.jobAttachedRate ?? 0,
    staleRate: staleness?.staleRate ?? 0,
    avgMins: totalMins / tasks.length,
    trend,
  };
}

// Build activity profiles for all clusters in a task set.
// Tasks are grouped by a label function (typically the cluster label
// from taskIntelligence's buildClusters).
export function buildAllActivityProfiles(
  tasks: CompletedTaskFacts[],
  labelFn: (task: CompletedTaskFacts) => string,
  now: Date = new Date()
): ActivityProfile[] {
  // Group by label
  const groups = new Map<string, CompletedTaskFacts[]>();
  for (const t of tasks) {
    const label = labelFn(t);
    const group = groups.get(label) ?? [];
    group.push(t);
    groups.set(label, group);
  }

  const profiles: ActivityProfile[] = [];
  for (const [label, groupTasks] of groups) {
    const profile = buildActivityProfile(label, groupTasks, now);
    if (profile) profiles.push(profile);
  }

  return profiles.sort((a, b) => b.count - a.count);
}
