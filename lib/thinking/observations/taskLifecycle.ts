// lib/thinking/observations/taskLifecycle.ts
//
// Observation: how do tasks in this cluster move through their lifecycle?
// Answers questions like:
//   - How long do tasks typically take from creation to completion?
//   - Do they clear same-day or carry over?
//   - How old are tasks when they finally complete?

import type { CompletedTaskFacts, LifecycleObservation, Confidence } from '../types';
import { classifyConfidence } from '../confidence';

const MS_PER_DAY = 86_400_000;

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / MS_PER_DAY;
}

function utcDate(iso: string): string {
  return iso.slice(0, 10); // "2026-01-10"
}

function sameDay(a: string, b: string): boolean {
  return utcDate(a) === utcDate(b);
}

export function observeLifecycle(tasks: CompletedTaskFacts[]): LifecycleObservation | null {
  const completed = tasks.filter((t) => t.completed_at && t.actual_mins != null);
  if (completed.length === 0) return null;

  let totalDaysToCompletion = 0;
  let sameDayCount = 0;
  let carryoverCount = 0;
  let totalAgeDays = 0;

  for (const t of completed) {
    const age = daysBetween(t.created_at, t.completed_at!);
    totalAgeDays += age;

    if (sameDay(t.created_at, t.completed_at!)) {
      sameDayCount++;
    } else {
      carryoverCount++;
    }

    // Time-to-completion from creation
    totalDaysToCompletion += age;
  }

  const n = completed.length;
  const confidence = classifyConfidence(n);

  return {
    kind: 'lifecycle',
    clusterLabel: null, // caller sets this when filtering by cluster
    avgDaysToCompletion: totalDaysToCompletion / n,
    sameDayRate: sameDayCount / n,
    carryoverRate: carryoverCount / n,
    avgAgeDays: totalAgeDays / n,
    sampleCount: n,
    confidence,
    observedAt: new Date().toISOString(),
  };
}

// Observe lifecycle for a specific cluster (pre-filtered tasks).
export function observeClusterLifecycle(
  tasks: CompletedTaskFacts[],
  clusterLabel: string
): LifecycleObservation | null {
  const obs = observeLifecycle(tasks);
  if (obs) obs.clusterLabel = clusterLabel;
  return obs;
}
