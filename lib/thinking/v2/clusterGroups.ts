import { CompletedTaskFacts } from '../types';

/**
 * Deterministic, dependency-free text clustering for V2 detectors.
 *
 * This intentionally does NOT reuse lib/taskIntelligence: that module imports
 * back into lib/thinking (a circular dependency) and uses an `@/` alias that
 * vitest cannot resolve cleanly. Keeping a small, order-independent, pure
 * cluster helper here lets the corpus detectors run standalone and stay
 * testable, and avoids an O(n²) re-cluster per detector.
 *
 * Clustering is by exact normalised-text grouping on content tokens, so two
 * tasks with the same meaningful wording land in the same cluster. This is
 * deliberately conservative — it is a grouping aid, not an inference.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'for', 'my', 'and', 'or', 'of', 'in', 'on',
  'with', 'about', 'some', 'this', 'that', 'it', 'up', 'out', 'i', 'at',
]);

export interface ClusterGroup {
  label: string;
  tasks: CompletedTaskFacts[];
}

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

/**
 * Group tasks into clusters by shared content tokens. Returns an array of
 * stable cluster groups. Groups of size 1 are included (some detectors only
 * need ≥1 task), but detectors apply their own minimum-evidence gates.
 */
export function buildClusterGroups(tasks: CompletedTaskFacts[]): ClusterGroup[] {
  const groups = new Map<string, ClusterGroup>();

  for (const task of tasks) {
    const tk = tokens(task.text);
    let matchedKey: string | null = null;

    // Single-pass: join the first group that overlaps on a content token.
    // Deterministic because we iterate insertion order.
    for (const [key, group] of groups) {
      const groupTokens = new Set(tokens(group.tasks[0].text));
      if (tk.some((t) => groupTokens.has(t))) {
        matchedKey = key;
        break;
      }
    }

    if (matchedKey === null) {
      // New cluster keyed by the first task's text.
      const key = task.text;
      groups.set(key, { label: key, tasks: [task] });
    } else {
      const group = groups.get(matchedKey)!;
      group.tasks.push(task);
    }
  }

  return [...groups.values()];
}
