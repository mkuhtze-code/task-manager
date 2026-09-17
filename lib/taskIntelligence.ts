// lib/taskIntelligence.ts
//
// The quiet learning layer behind Dokkit's capacity math. This module
// never talks to Supabase directly — it's pure functions over data the
// caller already has, so it can be used from the capture sheet, the
// capacity calculation on the home page, and the Patterns page without
// duplicating logic in three places.
//
// What it does:
//   1. Groups a user's completed-task history into fuzzy clusters (so
//      "quote reroof" and "Reroof quote" are recognized as the same thing).
//   2. Given new task text, finds the closest matching cluster and proposes
//      a learned estimate, with an honest confidence level attached.
//   3. Blends a typed estimate with the learned one — gently, and only
//      once there's enough history to trust it.
//   4. Same clustering also remembers location, when tasks in a cluster
//      have had one attached — a repeated errand's place doesn't average
//      the way duration does, so this is last-seen-wins, not a blend.
//
// Estimation logic (effectiveEstimate, hasMeaningfulDivergence) now
// delegates to lib/thinking/decisions/effectiveEstimate.ts, which carries
// the full decision context for the thinking engine. The functions here
// remain as backward-compatible wrappers.

import {
  computeEffectiveEstimate as _computeEffectiveEstimate,
  hasMeaningfulDivergence as _hasMeaningfulDivergence,
  type Confidence,
} from '@/lib/thinking/decisions/effectiveEstimate';
import {
  decideJobContext,
} from '@/lib/thinking/decisions/jobContext';
import {
  findClusterJobAssociations,
} from '@/lib/thinking/associations/clusterJob';
import {
  findClusterPlaceAssociations,
} from '@/lib/thinking/associations/clusterPlace';
import {
  decideLocationMemory,
} from '@/lib/thinking/decisions/locationMemory';
import type { CompletedTaskFacts, DecisionAuthority } from '@/lib/thinking/types';

export type HistoricalTask = {
  text: string;
  actual_mins: number;
  location_text?: string | null;
  lat?: number | null;
  lng?: number | null;
  job_id?: string | null;
  created_at?: string | null;
  /** When set with created_at, powers same-day vs carry behaviour. */
  completed_at?: string | null;
};

export type ClusterLocation = {
  text: string;
  lat: number;
  lng: number;
};

export type TaskCluster = {
  label: string; // the earliest/most representative raw text in the cluster
  tokens: Set<string>; // union of tokens seen across the cluster, for matching
  count: number;
  totalMins: number;
  avgMins: number;
  location: ClusterLocation | null; // most recently seen location, if any
};

// Re-export Confidence from the thinking engine so existing imports
// from this file continue to work.
export type { Confidence } from '@/lib/thinking/decisions/effectiveEstimate';

export type EstimateSuggestion = {
  suggestedMins: number;
  confidence: Confidence;
  sampleCount: number;
  matchedLabel: string;
};

export type LocationSuggestion = {
  location: ClusterLocation;
  sampleCount: number;
  matchedLabel: string;
};

export type JobSuggestion = {
  jobId: string;
  confidence: Confidence;
  authority: DecisionAuthority;
  agreeingDimensions: string[];
};

export type LocationMemorySuggestion = {
  locationText: string;
  lat: number;
  lng: number;
  confidence: Confidence;
  authority: DecisionAuthority;
  occurrenceCount: number;
  ratio: number;
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

    const taskLocation: ClusterLocation | null =
      task.location_text && task.lat != null && task.lng != null
        ? { text: task.location_text, lat: task.lat, lng: task.lng }
        : null;

    if (bestCluster && bestScore >= GROUP_SIMILARITY_THRESHOLD) {
      bestCluster.tokens = new Set([...bestCluster.tokens, ...taskTokens]);
      bestCluster.count += 1;
      bestCluster.totalMins += task.actual_mins;
      bestCluster.avgMins = bestCluster.totalMins / bestCluster.count;
      // Last-seen-wins: a place doesn't average the way duration does —
      // if you've moved which pharmacy you use, the newer one is the
      // one worth suggesting, not a blend of both.
      if (taskLocation) bestCluster.location = taskLocation;
    } else {
      clusters.push({
        label: task.text.trim(),
        tokens: taskTokens,
        count: 1,
        totalMins: task.actual_mins,
        avgMins: task.actual_mins,
        location: taskLocation,
      });
    }
  }

  return clusters;
}

// ── Shared cluster matching ────────────────────────────────────────

function findBestCluster(
  inputTokens: Set<string>,
  clusters: TaskCluster[]
): { cluster: TaskCluster; score: number } | null {
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
  return { cluster: bestCluster, score: bestScore };
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
  const match = findBestCluster(inputTokens, clusters);
  if (!match) return null;
  if (match.cluster.count < MIN_SAMPLES_FOR_SUGGESTION) return null;

  let confidence: Confidence = 'low';
  if (match.cluster.count >= 7) confidence = 'high';
  else if (match.cluster.count >= 4) confidence = 'medium';

  return {
    suggestedMins: Math.round(match.cluster.avgMins),
    confidence,
    sampleCount: match.cluster.count,
    matchedLabel: match.cluster.label,
  };
}

// Same matching logic as suggestEstimate, pointed at location instead of
// duration. Kept as a separate function (not folded into suggestEstimate)
// since a task can meaningfully have one without the other — a two-minute
// phone call has no location; a first-time errand has no learned duration
// yet even once a location's been entered.
export function suggestLocation(
  inputText: string,
  history: HistoricalTask[],
  precomputedClusters?: TaskCluster[]
): LocationSuggestion | null {
  const inputTokens = tokenize(inputText);
  if (inputTokens.size === 0) return null;

  const clusters = precomputedClusters ?? buildClusters(history);
  const match = findBestCluster(inputTokens, clusters);
  if (!match || !match.cluster.location) return null;

  return {
    location: match.cluster.location,
    sampleCount: match.cluster.count,
    matchedLabel: match.cluster.label,
  };
}

// ── Cluster membership ──────────────────────────────────────────────
// Reconstructs which tasks belong to which cluster by re-running the
// clustering assignment logic. Needed because buildClusters() doesn't
// store the task-to-cluster mapping.

export function groupTasksByCluster<T extends { text: string }>(
  history: T[],
  clusters: TaskCluster[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

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

    const key = bestCluster && bestScore >= GROUP_SIMILARITY_THRESHOLD
      ? bestCluster.label
      : '__unmatched__';

    const existing = groups.get(key) ?? [];
    existing.push(task);
    groups.set(key, existing);
  }

  return groups;
}

// ── Convert HistoricalTask to CompletedTaskFacts ────────────────────
// The thinking engine operates on CompletedTaskFacts. We reconstruct
// partial objects from the historical data we have.

function historicalToFacts(h: HistoricalTask): CompletedTaskFacts {
  return {
    text: h.text,
    status: 'done',
    source: 'planned',
    estimate_mins: h.actual_mins,
    actual_mins: h.actual_mins,
    logged_mins: h.actual_mins,
    created_at: h.created_at || '',
    completed_at: h.completed_at ?? null,
    started_at: null,
    surface_date: null,
    location_text: h.location_text ?? null,
    lat: h.lat ?? null,
    lng: h.lng ?? null,
    job_id: h.job_id ?? null,
    info: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    subtaskTotalMins: 0,
  };
}

// ── Job Context Suggestion ──────────────────────────────────────────
// Given typed text, finds the best-matching cluster and evaluates
// whether the engine can suggest a job assignment. Uses the Scope 3E
// decision module (decideJobContext) which requires ≥2 independent
// evidence dimensions to agree.

export function suggestJob(
  inputText: string,
  history: HistoricalTask[],
  precomputedClusters?: TaskCluster[]
): JobSuggestion | null {
  const inputTokens = tokenize(inputText);
  if (inputTokens.size === 0) return null;

  // Need job_id in history to compute job associations
  const hasJobData = history.some((h) => h.job_id);
  if (!hasJobData) return null;

  const clusters = precomputedClusters ?? buildClusters(history);
  const match = findBestCluster(inputTokens, clusters);
  if (!match) return null;

  // Get all tasks in the matched cluster
  const grouped = groupTasksByCluster(history, clusters);
  const clusterTasks = grouped.get(match.cluster.label) ?? [];
  if (clusterTasks.length < 4) return null; // MIN_TOTAL_FOR_JOB

  // Convert to CompletedTaskFacts for the thinking engine
  const facts = clusterTasks.map(historicalToFacts);

  // Compute job associations for this cluster
  const jobAssoc = findClusterJobAssociations(match.cluster.label, facts);
  if (jobAssoc.length === 0) return null;

  // Create a minimal input task for the decision
  const inputTask: CompletedTaskFacts = {
    text: inputText,
    status: 'done',
    source: 'planned',
    estimate_mins: 0,
    actual_mins: 0,
    logged_mins: 0,
    created_at: new Date().toISOString(),
    completed_at: null,
    started_at: null,
    surface_date: null,
    location_text: null,
    lat: null,
    lng: null,
    job_id: null,
    info: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    subtaskTotalMins: 0,
  };

  const decision = decideJobContext(inputTask, facts, jobAssoc);
  if (!decision) return null;

  return {
    jobId: decision.jobId,
    confidence: decision.confidence,
    authority: decision.authority,
    agreeingDimensions: decision.agreeingDimensions,
  };
}

// ── Location Memory Suggestion ──────────────────────────────────────
// Enhanced version of suggestLocation that uses the Scope 3E decision
// module for authority/confidence. Returns authority information so
// the UI can decide how aggressively to use the memory.

export function suggestLocationMemory(
  inputText: string,
  history: HistoricalTask[],
  precomputedClusters?: TaskCluster[]
): LocationMemorySuggestion | null {
  const inputTokens = tokenize(inputText);
  if (inputTokens.size === 0) return null;

  const clusters = precomputedClusters ?? buildClusters(history);
  const match = findBestCluster(inputTokens, clusters);
  if (!match) return null;

  // Get all tasks in the matched cluster
  const grouped = groupTasksByCluster(history, clusters);
  const clusterTasks = grouped.get(match.cluster.label) ?? [];
  if (clusterTasks.length < 4) return null;

  // Convert to CompletedTaskFacts for the thinking engine
  const facts = clusterTasks.map(historicalToFacts);

  // Compute place associations for this cluster
  const placeAssoc = findClusterPlaceAssociations(match.cluster.label, facts);
  if (placeAssoc.length === 0) return null;

  // Create a minimal input task (no location)
  const inputTask: CompletedTaskFacts = {
    text: inputText,
    status: 'done',
    source: 'planned',
    estimate_mins: 0,
    actual_mins: 0,
    logged_mins: 0,
    created_at: new Date().toISOString(),
    completed_at: null,
    started_at: null,
    surface_date: null,
    location_text: null,
    lat: null,
    lng: null,
    job_id: null,
    info: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    subtaskTotalMins: 0,
  };

  const decision = decideLocationMemory(inputTask, facts, placeAssoc);
  if (!decision) return null;

  return {
    locationText: decision.locationText,
    lat: decision.lat,
    lng: decision.lng,
    confidence: decision.confidence,
    authority: decision.authority,
    occurrenceCount: decision.occurrenceCount,
    ratio: decision.ratio,
  };
}

// ── Location-trigger heuristic ──────────────────────────────────────
// Deterministic phrase matching, not AI — the same "genuine intelligence
// without the AI label" discipline as the rest of this module. Fires on
// verbs/phrases that typically imply visiting or going somewhere, so the
// capture sheet knows when to offer an optional location field rather
// than showing it on every task.
const LOCATION_TRIGGER_PHRASES = [
  'pick up', 'pickup', 'drop off', 'dropoff', 'drop something off',
  'meet at', 'meet with', 'go to', 'deliver', 'collect',
  'visit', 'swing by', 'stop by', 'head to', 'appointment at',
];

export function suggestsLocation(inputText: string): boolean {
  const normalized = normalize(inputText);
  return LOCATION_TRIGGER_PHRASES.some((phrase) => normalized.includes(phrase));
}

// ── Blending typed estimates with learned reality ───────────────────
// Delegates to the thinking engine's computeEffectiveEstimate for the
// actual blending logic. The wrappers here maintain backward compatibility
// with all existing call sites.

// Exposed on its own (not just inlined in effectiveEstimate) because the UI
// needs the same "is this actually worth mentioning" judgment call to
// decide whether to show a quiet hint next to a task.
export function hasMeaningfulDivergence(typedMins: number, suggestedMins: number): boolean {
  return _hasMeaningfulDivergence(typedMins, suggestedMins);
}

export function effectiveEstimate(typedMins: number, suggestion: EstimateSuggestion | null): number {
  if (!suggestion) return typedMins;
  const decision = _computeEffectiveEstimate({
    typedMins,
    suggestedMins: suggestion.suggestedMins,
    confidence: suggestion.confidence,
    clusterCount: suggestion.sampleCount,
  });
  return decision.blendedMins;
}
