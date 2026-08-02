// lib/taskIntelligence.ts
//
// The quiet learning layer behind Dokkit's capacity math. This module never
// talks to Supabase directly — it's pure functions over data the caller
// already has, so it can be used from the capture sheet, the capacity
// calculation on the home page, and the Patterns page without duplicating
// logic in three places.
//
// What it does:
//   1. Groups a user's completed-task history into fuzzy clusters (so
//      "quote reroof" and "Reroof quote" are recognized as the same thing).
//   2. Given new task text, finds the closest matching cluster and proposes
//      a learned estimate, with an honest confidence level attached.
//   3. Blends a typed estimate with the learned one — gently, and only
//      once there's enough history to trust it.

export type HistoricalTask = {
  text: string;
  actual_mins: number;
};

export type TaskCluster = {
  label: string; // the earliest/most representative raw text in the cluster
  tokens: Set<string>; // union of tokens seen across the cluster, for matching
  count: number;
  totalMins: number;
  avgMins: number;
};

export type Confidence = 'low' | 'medium' | 'high';

export type EstimateSuggestion = {
  suggestedMins: number;
  confidence: Confidence;
  sampleCount: number;
  matchedLabel: string;
};

// ── Tuning knobs ───────────────────────────────────────────────────
// Kept in one place since these are the numbers most likely to need a
// nudge once real usage data comes in.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'for', 'my', 'and', 'or', 'of', 'in', 'on',
  'with', 'about', 'some', 'this', 'that', 'it', 'up', 'out',
]);

const GROUP_SIMILARITY_THRESHOLD = 0.5; // how similar two tasks must be to join the same cluster
const MATCH_SIMILARITY_THRESHOLD = 0.4; // how similar new input must be to a cluster to suggest it
const MIN_SAMPLES_FOR_SUGGESTION = 2; // never suggest off a single data point

// ── Text normalization ──────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

function tokenize(text: string): Set<string> {
  const words = normalize(text).split(' ').filter((w) => w.length > 0 && !STOPWORDS.has(w));
  return new Set(words);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const unionSize = a.size + b.size - intersection;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

// ── Clustering ───────────────────────────────────────────────────────
// Greedy single-pass clustering: walk the history, and for each task either
// join it to the closest existing cluster (if similar enough) or start a
// new one. Order-independent enough in practice for this use case — this
// isn't trying to be a perfect clustering algorithm, just a good-enough
// "have I basically seen this before" signal.

export function buildClusters(history: HistoricalTask[]): TaskCluster[] {
  const clusters: TaskCluster[] = [];

  for (const task of history) {
    const taskTokens = tokenize(task.text);
    if (taskTokens.size === 0) continue;

    let bestCluster: TaskCluster | null = null;
    let bestScore = 0;

    for (const cluster of clusters) {
      const score = jaccardSimilarity(taskTokens, cluster.tokens);
      if (score > bestScore) {
        bestScore = score;
        bestCluster = cluster;
      }
    }

    if (bestCluster && bestScore >= GROUP_SIMILARITY_THRESHOLD) {
      bestCluster.tokens = new Set([...bestCluster.tokens, ...taskTokens]);
      bestCluster.count += 1;
      bestCluster.totalMins += task.actual_mins;
      bestCluster.avgMins = bestCluster.totalMins / bestCluster.count;
    } else {
      clusters.push({
        label: task.text.trim(),
        tokens: taskTokens,
        count: 1,
        totalMins: task.actual_mins,
        avgMins: task.actual_mins,
      });
    }
  }

  return clusters;
}

// ── Suggestion lookup ─────────────────────────────────────────────────

export function suggestEstimate(
  inputText: string,
  history: HistoricalTask[],
  precomputedClusters?: TaskCluster[]
): EstimateSuggestion | null {
  const inputTokens = tokenize(inputText);
  if (inputTokens.size === 0) return null;

  const clusters = precomputedClusters ?? buildClusters(history);

  let bestCluster: TaskCluster | null = null;
  let bestScore = 0;

  for (const cluster of clusters) {
    const score = jaccardSimilarity(inputTokens, cluster.tokens);
    if (score > bestScore) {
      bestScore = score;
      bestCluster = cluster;
    }
  }

  if (!bestCluster || bestScore < MATCH_SIMILARITY_THRESHOLD) return null;
  if (bestCluster.count < MIN_SAMPLES_FOR_SUGGESTION) return null;

  let confidence: Confidence = 'low';
  if (bestCluster.count >= 7) confidence = 'high';
  else if (bestCluster.count >= 4) confidence = 'medium';

  return {
    suggestedMins: Math.round(bestCluster.avgMins),
    confidence,
    sampleCount: bestCluster.count,
    matchedLabel: bestCluster.label,
  };
}

// ── Blending typed estimates with learned reality ───────────────────
// This is the part that actually changes behavior, not just suggests it:
// when computing what capacity math should use, don't take a typed
// estimate at total face value if history disagrees — but don't override
// it wholesale either, especially on thin data. The blend weight grows
// with sample count, so a couple of matches nudge gently and a long track
// record speaks louder.

const BLEND_WEIGHTS: Record<Confidence, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
};

// Exposed on its own (not just inlined in effectiveEstimate) because the UI
// needs the same "is this actually worth mentioning" judgment call to
// decide whether to show a quiet hint next to a task.
export function hasMeaningfulDivergence(typedMins: number, suggestedMins: number): boolean {
  const diff = Math.abs(suggestedMins - typedMins);
  return diff >= 5 && diff / Math.max(typedMins, 1) >= 0.15;
}

export function effectiveEstimate(typedMins: number, suggestion: EstimateSuggestion | null): number {
  if (!suggestion) return typedMins;
  if (!hasMeaningfulDivergence(typedMins, suggestion.suggestedMins)) return typedMins;

  const weight = BLEND_WEIGHTS[suggestion.confidence];
  const blended = typedMins * (1 - weight) + suggestion.suggestedMins * weight;
  return Math.round(blended);
}
