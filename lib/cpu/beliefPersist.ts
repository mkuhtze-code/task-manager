import type { BeliefGraph } from './beliefs';
import { emptyBeliefGraph } from './beliefs';

const KEY = 'dokkit.cpu.beliefs.v1';

function suffix(userId: string | null | undefined): string {
  return userId ? `:${userId}` : '';
}

export function loadBeliefGraphLocal(userId?: string | null): BeliefGraph {
  if (typeof localStorage === 'undefined') return emptyBeliefGraph();
  try {
    const raw = localStorage.getItem(KEY + suffix(userId));
    if (!raw) return emptyBeliefGraph();
    const parsed = JSON.parse(raw) as BeliefGraph;
    if (parsed?.version !== 1 || !Array.isArray(parsed.beliefs)) {
      return emptyBeliefGraph();
    }
    return parsed;
  } catch {
    return emptyBeliefGraph();
  }
}

export function saveBeliefGraphLocal(
  graph: BeliefGraph,
  userId?: string | null
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY + suffix(userId), JSON.stringify(graph));
  } catch {
    /* local cache is best effort */
  }
}
