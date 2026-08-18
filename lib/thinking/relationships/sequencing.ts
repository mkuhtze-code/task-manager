// lib/thinking/relationships/sequencing.ts
//
// Deterministic ordering and adjacency detection over CompletedTaskFacts.
// Establishes "what came before what" without inferring why. These are
// spatial-temporal relationships (facts), not semantic interpretations
// (e.g. "material runs are part of the site-visit workflow").

import type { CompletedTaskFacts } from '../types';
import { isSameDay, groupByDate } from './temporal';

// ── Task identity ──────────────────────────────────────────────────
// Tasks in CompletedTaskFacts are identified by their text. This is
// the same convention the engine uses for cluster labels. If a future
// scope needs disambiguation for duplicate task names, an optional id
// field can be added to CompletedTaskFacts at that point.

/** Stable string identifier for a task within the sequencing module. */
export function taskIdentifier(task: CompletedTaskFacts): string {
  return task.text;
}

// ── Chronological ordering ─────────────────────────────────────────

/**
 * Deterministic chronological ordering of tasks by created_at.
 *
 * created_at is the moment the user captured the task — the earliest
 * lifecycle timestamp and the correct ordering anchor. started_at and
 * completed_at happen later and represent execution, not sequence.
 *
 * Tasks with null/invalid created_at are placed at the end (we cannot
 * determine their position). Ties are broken alphabetically by text
 * for deterministic output.
 *
 * Does not mutate the input array.
 */
export function orderChronologically(
  tasks: CompletedTaskFacts[]
): CompletedTaskFacts[] {
  return [...tasks].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : Infinity;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : Infinity;
    if (aTime !== bTime) return aTime - bTime;
    return a.text.localeCompare(b.text);
  });
}

// ── Adjacency pairs ────────────────────────────────────────────────

export type AdjacencyPair = {
  preceding: string; // task text of the first activity
  following: string; // task text of the second activity
  date: string; // YYYY-MM-DD UTC — which day this adjacency occurred
  gapMinutes: number | null; // minutes between created_at of A and B
};

/**
 * Build sequential adjacency pairs from tasks that share the same UTC day.
 *
 * Within each day, tasks are ordered by created_at (via orderChronologically).
 * Each consecutive pair of valid tasks becomes an AdjacencyPair. Tasks
 * without valid created_at are excluded.
 *
 * This establishes the factual sequence "A directly preceded B on this day"
 * without inferring semantic workflow.
 */
export function buildAdjacencyPairs(
  tasks: CompletedTaskFacts[]
): AdjacencyPair[] {
  const pairs: AdjacencyPair[] = [];

  const validTasks = tasks.filter(
    (t) => t.created_at && !Number.isNaN(new Date(t.created_at).getTime())
  );

  const dayGroups = groupByDate(validTasks, (t) => t.created_at);

  for (const [, dayTasks] of dayGroups) {
    const ordered = orderChronologically(dayTasks);

    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i];
      const b = ordered[i + 1];
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      const gapMs = bTime - aTime;

      pairs.push({
        preceding: taskIdentifier(a),
        following: taskIdentifier(b),
        date: a.created_at.slice(0, 10),
        gapMinutes:
          gapMs >= 0 ? Math.round(gapMs / 60_000) : null,
      });
    }
  }

  return pairs;
}

// ── Aggregation ────────────────────────────────────────────────────

export type AggregatedAdjacency = {
  preceding: string;
  following: string;
  count: number;
  occurrences: AdjacencyPair[]; // supporting evidence
};

/**
 * Aggregate adjacency pairs by (preceding, following) identity.
 *
 * Returns pairs sorted by count descending, then alphabetically.
 * Each aggregated pair retains the full list of occurrences as evidence
 * for future confidence calculation.
 *
 * This is a pure aggregation — no interpretation, no thresholding.
 */
export function aggregateAdjacency(
  pairs: AdjacencyPair[]
): AggregatedAdjacency[] {
  const map = new Map<string, AggregatedAdjacency>();

  for (const pair of pairs) {
    const key = `${pair.preceding}→${pair.following}`;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      existing.occurrences.push(pair);
    } else {
      map.set(key, {
        preceding: pair.preceding,
        following: pair.following,
        count: 1,
        occurrences: [pair],
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.preceding.localeCompare(b.preceding) ||
      a.following.localeCompare(b.following);
  });
}
