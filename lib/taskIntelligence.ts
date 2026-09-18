// lib/taskIntelligence.ts
//
// The quiet learning layer behind Dokkit's capacity math. This module
// never talks to Supabase directly — it's pure functions over data the
// caller already has.
//
// Estimation logic (effectiveEstimate, hasMeaningfulDivergence) delegates
// to lib/thinking/decisions/effectiveEstimate.ts.

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
  completed_at?: string | null;
};

export type ClusterLocation = {
  text: string;
  lat: number;
  lng: number;
};

export type TaskCluster = {
  label: string;
  tokens: Set<string>;
  count: number;
  totalMins: number;
  avgMins: number;
  location: ClusterLocation | null;
};

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
