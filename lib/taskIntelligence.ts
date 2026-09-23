// lib/taskIntelligence.ts
//
// The quiet learning layer behind Dokkit's capacity math. This module
// never talks to Supabase directly — it's pure functions over data the
// caller already has.
//
// Estimation logic (effectiveEstimate, hasMeaningfulDivergence) delegates
// to lib/thinking/decisions/effectiveEstimate.ts.
//
// Duration quality: actual_mins of 0 (tap-Done without a timer) must not
// drag cluster averages toward zero. When reliable timed samples are
// scarce, lifecycle structure (job, carry, subtasks, anchors) seeds a
// soft duration instead.

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
import {
  isReliableActualMins,
  lifecycleSoftMins,
} from '@/lib/thinking/durationQuality';

export type HistoricalTask = {
  text: string;
  actual_mins: number;
  location_text?: string | null;
  lat?: number | null;
  lng?: number | null;
  job_id?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  /** Lifecycle / structure signals — used when timed actuals are unreliable. */
  estimate_mins?: number | null;
  logged_mins?: number | null;
  due_today?: boolean | null;
  surface_date?: string | null;
  source?: string | null;
  intended_time?: string | null;
  subtask_count?: number | null;
};

export type ClusterLocation = {
  text: string;
  lat: number;
  lng: number;
};

export type TaskCluster = {
  label: string;
  tokens: Set<string>;
  /** Completions matched into this cluster (including zero-duration). */
  count: number;
  /** Sum of *reliable* actual minutes only. */
  totalMins: number;
  /** Average of *reliable* actual minutes; 0 if none yet. */
  avgMins: number;
  /** How many completions contributed a reliable duration. */
  reliableCount: number;
  location: ClusterLocation | null;
  /** Share of cluster completions attached to a job (0–1). */
  jobRate: number;
  jobAttachedCount: number;
  /** Share finished same calendar day when timestamps exist (0–1). */
  sameDayRate: number;
  sameDaySamples: number;
  /** Average subtask count across completions that reported it. */
  avgSubtaskCount: number;
  subtaskSamples: number;
};

export type { Confidence } from '@/lib/thinking/decisions/effectiveEstimate';

export type EstimateSuggestion = {
  suggestedMins: number;
  confidence: Confidence;
  sampleCount: number;
  matchedLabel: string;
  /** measured = timed history; lifecycle = structure fallback; mixed = both. */
  source: 'measured' | 'lifecycle' | 'mixed';
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

const STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'for', 'my', 'and', 'or', 'of', 'in', 'on',
  'with', 'about', 'some', 'this', 'that', 'it', 'up', 'out',
]);

const GROUP_SIMILARITY_THRESHOLD = 0.5;
const MATCH_SIMILARITY_THRESHOLD = 0.4;
const MIN_SAMPLES_FOR_SUGGESTION = 2;

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

function sameCalendarDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function emptyCluster(label: string, tokens: Set<string>, location: ClusterLocation | null): TaskCluster {
  return {
    label,
    tokens,
    count: 0,
    totalMins: 0,
    avgMins: 0,
    reliableCount: 0,
    location,
    jobRate: 0,
    jobAttachedCount: 0,
    sameDayRate: 0,
    sameDaySamples: 0,
    avgSubtaskCount: 0,
    subtaskSamples: 0,
  };
}

function absorbTask(cluster: TaskCluster, task: HistoricalTask, taskTokens: Set<string>) {
  cluster.tokens = new Set([...cluster.tokens, ...taskTokens]);
  cluster.count += 1;

  if (isReliableActualMins(task.actual_mins)) {
    cluster.reliableCount += 1;
    cluster.totalMins += task.actual_mins;
    cluster.avgMins = cluster.totalMins / cluster.reliableCount;
  }

  if (task.job_id) {
    cluster.jobAttachedCount += 1;
  }
  cluster.jobRate = cluster.jobAttachedCount / cluster.count;

  if (task.created_at && task.completed_at) {
    cluster.sameDaySamples += 1;
    if (sameCalendarDay(task.created_at, task.completed_at)) {
      cluster.sameDayRate =
        (cluster.sameDayRate * (cluster.sameDaySamples - 1) + 1) / cluster.sameDaySamples;
    } else {
      cluster.sameDayRate =
        (cluster.sameDayRate * (cluster.sameDaySamples - 1)) / cluster.sameDaySamples;
    }
  }

  if (typeof task.subtask_count === 'number' && task.subtask_count >= 0) {
    cluster.subtaskSamples += 1;
    cluster.avgSubtaskCount =
      (cluster.avgSubtaskCount * (cluster.subtaskSamples - 1) + task.subtask_count) /
      cluster.subtaskSamples;
  }

  if (task.location_text && task.lat != null && task.lng != null) {
    cluster.location = {
      text: task.location_text,
      lat: task.lat,
      lng: task.lng,
    };
  }
}

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
      absorbTask(bestCluster, task, taskTokens);
    } else {
      const created = emptyCluster(task.text.trim(), taskTokens, taskLocation);
      absorbTask(created, task, taskTokens);
      clusters.push(created);
    }
  }

  return clusters;
}

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

/**
 * Suggest a duration for similar work.
 * Prefers reliable timed samples. If those are scarce but the cluster has
 * structure (jobs, carry, subtasks), uses lifecycle soft mins instead of
 * averaging zeros.
 */
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

  const c = match.cluster;
  const hasMeasured = c.reliableCount >= MIN_SAMPLES_FOR_SUGGESTION;

  // Lifecycle soft from cluster-level rates + any matching history rows' structure.
  const soft = lifecycleSoftMins({
    jobRate: c.jobRate,
    sameDayRate: c.sameDaySamples >= 2 ? c.sameDayRate : null,
    subtaskCount: c.subtaskSamples >= 1 ? Math.round(c.avgSubtaskCount) : null,
  });

  let suggestedMins: number;
  let source: EstimateSuggestion['source'];
  let sampleCount: number;

  if (hasMeasured && soft != null && c.reliableCount < c.count) {
    // Mixed: some real times, many zeros — blend toward measured, don't ignore structure.
    suggestedMins = Math.round(c.avgMins * 0.75 + soft * 0.25);
    source = 'mixed';
    sampleCount = c.reliableCount;
  } else if (hasMeasured) {
    suggestedMins = Math.round(c.avgMins);
    source = 'measured';
    sampleCount = c.reliableCount;
  } else if (soft != null) {
    suggestedMins = soft;
    source = 'lifecycle';
    sampleCount = c.count;
  } else {
    return null;
  }

  let confidence: Confidence = 'low';
  if (source === 'measured') {
    if (sampleCount >= 7) confidence = 'high';
    else if (sampleCount >= 4) confidence = 'medium';
  } else if (source === 'mixed') {
    confidence = sampleCount >= 4 ? 'medium' : 'low';
  } else {
    // lifecycle-only — never high; structure is a prior, not a measurement.
    confidence = c.count >= 6 ? 'medium' : 'low';
  }

  return {
    suggestedMins,
    confidence,
    sampleCount,
    matchedLabel: c.label,
    source,
  };
}

/**
 * Human-readable basis for an estimate suggestion.
 * Client-only; does not log or persist free text beyond what the UI already shows.
 * Single path for capture, capacity, and task detail.
 */
export function explainEstimate(
  suggestion: EstimateSuggestion | null,
  typedMins?: number | null
): string | null {
  if (!suggestion) return null;

  const conf =
    suggestion.confidence === 'high'
      ? 'high confidence'
      : suggestion.confidence === 'medium'
        ? 'medium confidence'
        : 'low confidence';

  const n = suggestion.sampleCount;
  const finishes = `${n} timed finish${n === 1 ? '' : 'es'}`;

  let basis: string;
  if (suggestion.source === 'measured') {
    basis = `Based on ${finishes}`;
  } else if (suggestion.source === 'mixed') {
    basis = `Based on ${finishes} plus how similar work is structured`;
  } else {
    basis = 'Based on patterns in similar work (not enough timer data yet)';
  }

  let line = `${basis} · usually about ${suggestion.suggestedMins}m · ${conf}`;
  if (suggestion.matchedLabel) {
    line += ` · like “${suggestion.matchedLabel}”`;
  }
  if (
    typedMins != null &&
    typedMins > 0 &&
    _hasMeaningfulDivergence(typedMins, suggestion.suggestedMins)
  ) {
    line += ` · your ${typedMins}m differs`;
  }
  return line;
}

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

function historicalToFacts(h: HistoricalTask): CompletedTaskFacts {
  const reliable = isReliableActualMins(h.actual_mins);
  return {
    text: h.text,
    status: 'done',
    source: (h.source as 'planned' | 'came_up') || 'planned',
    estimate_mins: h.estimate_mins ?? (reliable ? h.actual_mins : 0),
    actual_mins: reliable ? h.actual_mins : null,
    logged_mins: h.logged_mins ?? (reliable ? h.actual_mins : 0),
    created_at: h.created_at || '',
    completed_at: h.completed_at ?? null,
    started_at: null,
    surface_date: h.surface_date ?? null,
    location_text: h.location_text ?? null,
    lat: h.lat ?? null,
    lng: h.lng ?? null,
    job_id: h.job_id ?? null,
    info: null,
    subtaskCount: h.subtask_count ?? 0,
    subtaskDoneCount: 0,
    subtaskTotalMins: 0,
  };
}

export function suggestJob(
  inputText: string,
  history: HistoricalTask[],
  precomputedClusters?: TaskCluster[]
): JobSuggestion | null {
  const inputTokens = tokenize(inputText);
  if (inputTokens.size === 0) return null;

  const hasJobData = history.some((h) => h.job_id);
  if (!hasJobData) return null;

  const clusters = precomputedClusters ?? buildClusters(history);
  const match = findBestCluster(inputTokens, clusters);
  if (!match) return null;

  const grouped = groupTasksByCluster(history, clusters);
  const clusterTasks = grouped.get(match.cluster.label) ?? [];
  if (clusterTasks.length < 4) return null;

  const facts = clusterTasks.map(historicalToFacts);
  const jobAssoc = findClusterJobAssociations(match.cluster.label, facts);
  if (jobAssoc.length === 0) return null;

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

  const grouped = groupTasksByCluster(history, clusters);
  const clusterTasks = grouped.get(match.cluster.label) ?? [];
  if (clusterTasks.length < 4) return null;

  const facts = clusterTasks.map(historicalToFacts);
  const placeAssoc = findClusterPlaceAssociations(match.cluster.label, facts);
  if (placeAssoc.length === 0) return null;

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

const LOCATION_TRIGGER_PHRASES = [
  'pick up', 'pickup', 'drop off', 'dropoff', 'drop something off',
  'meet at', 'meet with', 'go to', 'deliver', 'collect',
  'visit', 'swing by', 'stop by', 'head to', 'appointment at',
];

export function suggestsLocation(inputText: string): boolean {
  const normalized = normalize(inputText);
  return LOCATION_TRIGGER_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function hasMeaningfulDivergence(typedMins: number, suggestedMins: number): boolean {
  return _hasMeaningfulDivergence(typedMins, suggestedMins);
}

export function effectiveEstimate(
  typedMins: number,
  suggestion: EstimateSuggestion | null,
  blendScale?: number
): number {
  if (!suggestion) return typedMins;
  const decision = _computeEffectiveEstimate({
    typedMins,
    suggestedMins: suggestion.suggestedMins,
    confidence: suggestion.confidence,
    clusterCount: suggestion.sampleCount,
    blendScale,
  });
  return decision.blendedMins;
}

export { isReliableActualMins, lifecycleSoftMins, resolveActualForLearning } from '@/lib/thinking/durationQuality';
