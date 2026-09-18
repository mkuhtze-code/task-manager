/**
 * Runtime observations — one shared slice of history for daily decisions.
 *
 * Capture (duration chip), capacity (dayFit), and Jobs remaining should all
 * read the same match: duration, same-day behaviour, place, and label.
 *
 * Pure and deterministic. Never invents jobs or places.
 */

import {
  buildClusters,
  suggestEstimate,
  type HistoricalTask,
  type TaskCluster,
  type EstimateSuggestion,
  type ClusterLocation,
} from '@/lib/taskIntelligence';

const MATCH_THRESHOLD = 0.4;
const MIN_BEHAVIOUR_SAMPLES = 2;

export type ClusterBehaviour = {
  sameDayRate: number;
  samples: number;
};

export type RuntimeObservations = {
  history: HistoricalTask[];
  clusters: TaskCluster[];
  personalMedian: number | null;
  behaviourByLabel: Record<string, ClusterBehaviour>;
  softFloorMins: number;
  /** Scales lean on learned duration (from calibration). */
  blendScale: number;
  calibrationExplain: string | null;
};

export type TaskSignals = {
  estimate: EstimateSuggestion | null;
  sameDayRate: number | null;
  sameDaySamples: number;
  location: ClusterLocation | null;
  matchedLabel: string | null;
  explainDuration: string | null;
  explainBehaviour: string | null;
};

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
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

function findBestCluster(
  inputTokens: Set<string>,
  clusters: TaskCluster[]
): { cluster: TaskCluster; score: number } | null {
  let best: TaskCluster | null = null;
  let bestScore = 0;
  for (const c of clusters) {
    const score = jaccard(inputTokens, c.tokens);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best || bestScore < MATCH_THRESHOLD) return null;
  return { cluster: best, score: bestScore };
}

function personalMedianActual(history: HistoricalTask[]): number | null {
  const vals = history
    .map((h) => h.actual_mins)
    .filter((m): m is number => typeof m === 'number' && m > 0)
    .sort((a, b) => a - b);
  if (vals.length === 0) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 === 0 ? Math.round((vals[mid - 1] + vals[mid]) / 2) : vals[mid];
}

export function buildRuntimeObservations(
  history: HistoricalTask[],
  options?: {
    softFloorMins?: number;
    blendScale?: number;
    calibrationExplain?: string | null;
  }
): RuntimeObservations {
  const clusters = buildClusters(history);
  const behaviourByLabel: Record<string, ClusterBehaviour> = {};

  for (const cluster of clusters) {
    let matched = 0;
    let sameDay = 0;
    for (const h of history) {
      const score = jaccard(cluster.tokens, tokenize(h.text));
      if (score < MATCH_THRESHOLD) continue;
      if (!(h.created_at && h.completed_at)) continue;
      matched++;
      if (sameCalendarDay(h.created_at, h.completed_at)) sameDay++;
    }
    if (matched >= MIN_BEHAVIOUR_SAMPLES) {
      behaviourByLabel[cluster.label] = {
        sameDayRate: sameDay / matched,
        samples: matched,
      };
    }
  }

  return {
    history,
    clusters,
    personalMedian: personalMedianActual(history),
    behaviourByLabel,
    softFloorMins: options?.softFloorMins ?? 30,
    blendScale: options?.blendScale ?? 1,
    calibrationExplain: options?.calibrationExplain ?? null,
  };
}

export function lookupTaskSignals(text: string, runtime: RuntimeObservations): TaskSignals {
  const empty: TaskSignals = {
    estimate: null,
    sameDayRate: null,
    sameDaySamples: 0,
    location: null,
    matchedLabel: null,
    explainDuration: null,
    explainBehaviour: null,
  };

  const trimmed = text.trim();
  if (trimmed.length === 0) return empty;

  const estimate = suggestEstimate(trimmed, runtime.history, runtime.clusters);
  const match = findBestCluster(tokenize(trimmed), runtime.clusters);
  const matchedLabel = match?.cluster.label ?? estimate?.matchedLabel ?? null;
  const location = match?.cluster.location ?? null;

  let sameDayRate: number | null = null;
  let sameDaySamples = 0;
  if (matchedLabel && runtime.behaviourByLabel[matchedLabel]) {
    const b = runtime.behaviourByLabel[matchedLabel];
    sameDayRate = b.sameDayRate;
    sameDaySamples = b.samples;
  }

  let explainDuration: string | null = null;
  if (estimate) {
    explainDuration = `≈ ${estimate.suggestedMins}m — ${estimate.sampleCount} similar`;
  } else if (runtime.personalMedian != null) {
    explainDuration = `≈ ${runtime.personalMedian}m typical for you`;
  }

  let explainBehaviour: string | null = null;
  if (sameDayRate != null && sameDaySamples >= MIN_BEHAVIOUR_SAMPLES) {
    if (sameDayRate >= 0.55) {
      explainBehaviour = `Usually finished same day (${Math.round(sameDayRate * 100)}%)`;
    } else if (sameDayRate < 0.4) {
      explainBehaviour = `Often moves forward (${Math.round((1 - sameDayRate) * 100)}% carried)`;
    }
  }

  return {
    estimate,
    sameDayRate,
    sameDaySamples,
    location,
    matchedLabel,
    explainDuration,
    explainBehaviour,
  };
}
