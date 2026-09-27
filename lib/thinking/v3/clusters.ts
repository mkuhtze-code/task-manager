// lib/thinking/v3/clusters.ts
//
// Phase 4 — versioned cluster identity for the personal model.
//
// Pure. Deterministic. No network.
// Text is evidence for matching; clusterId is the stable identity.
// Duplicates the Jaccard idea used in taskIntelligence so V3 does not
// depend on the runtime module (avoids circular imports). Runtime may
// later call into this as the single clustering primitive.

import {
  durationFromSamples,
  consistencyScore,
  median,
} from './stats';
import type { DurationDistribution } from './types';

export const CLUSTER_MATCH_THRESHOLD = 0.4;
export const CLUSTER_VERSION = 1;

export type HistorySample = {
  text: string;
  /** Reliable actual minutes only — caller filters zeros / noise. */
  actualMins: number | null;
  createdAt?: string | null;
  completedAt?: string | null;
  jobId?: string | null;
  locationText?: string | null;
};

export type ClusterModel = {
  /** Stable id from sorted tokens — not display text. */
  clusterId: string;
  label: string;
  version: number;
  tokens: string[];
  sampleCount: number;
  /** Reliable duration samples (oldest → newest when known). */
  durationSamples: number[];
  duration: DurationDistribution | null;
  sameDayRate: number | null;
  sameDaySamples: number;
  consistency: number | null;
};

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Deterministic cluster id from a token set.
 * Same tokens → same id regardless of label wording.
 */
export function clusterIdFromTokens(tokens: Iterable<string>): string {
  const sorted = [...new Set(tokens)].map((t) => t.toLowerCase()).sort();
  if (sorted.length === 0) return 'cluster_empty';
  let h = 0x811c9dc5;
  const s = sorted.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hex = (h >>> 0).toString(16).padStart(8, '0');
  return `c_${hex}_${sorted.length}`;
}

function labelFromTokens(tokens: string[]): string {
  const sorted = [...tokens].sort((a, b) => b.length - a.length || a.localeCompare(b));
  return sorted.slice(0, 3).join(' ') || 'misc';
}

function sameCalendarDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/**
 * Build versioned clusters from history samples.
 * Greedy: each sample joins best matching cluster above threshold,
 * else starts a new cluster.
 */
export function buildClusterModels(
  samples: HistorySample[],
  opts?: { matchThreshold?: number }
): ClusterModel[] {
  const threshold = opts?.matchThreshold ?? CLUSTER_MATCH_THRESHOLD;
  type Acc = {
    tokens: Set<string>;
    texts: string[];
    durationSamples: number[];
    sameDayHits: number;
    sameDayTotal: number;
  };
  const groups: Acc[] = [];

  for (const sample of samples) {
    const tokens = tokenSet(sample.text);
    if (tokens.size === 0) continue;

    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < groups.length; i++) {
      const score = jaccard(tokens, groups[i].tokens);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestScore >= threshold) {
      const g = groups[bestIdx];
      for (const t of tokens) g.tokens.add(t);
      g.texts.push(sample.text);
      if (sample.actualMins != null && sample.actualMins > 0) {
        g.durationSamples.push(sample.actualMins);
      }
      if (sample.createdAt && sample.completedAt) {
        g.sameDayTotal++;
        if (sameCalendarDay(sample.createdAt, sample.completedAt)) {
          g.sameDayHits++;
        }
      }
    } else {
      const durationSamples =
        sample.actualMins != null && sample.actualMins > 0
          ? [sample.actualMins]
          : [];
      let sameDayHits = 0;
      let sameDayTotal = 0;
      if (sample.createdAt && sample.completedAt) {
        sameDayTotal = 1;
        if (sameCalendarDay(sample.createdAt, sample.completedAt)) {
          sameDayHits = 1;
        }
      }
      groups.push({
        tokens: new Set(tokens),
        texts: [sample.text],
        durationSamples,
        sameDayHits,
        sameDayTotal,
      });
    }
  }

  return groups.map((g) => {
    const tokenList = [...g.tokens].sort();
    const duration =
      g.durationSamples.length > 0
        ? durationFromSamples(g.durationSamples, 'median')
        : null;
    return {
      clusterId: clusterIdFromTokens(tokenList),
      label: labelFromTokens(tokenList),
      version: CLUSTER_VERSION,
      tokens: tokenList,
      sampleCount: g.texts.length,
      durationSamples: g.durationSamples,
      duration,
      sameDayRate:
        g.sameDayTotal >= 2 ? g.sameDayHits / g.sameDayTotal : null,
      sameDaySamples: g.sameDayTotal,
      consistency: consistencyScore(g.durationSamples),
    };
  });
}

export function matchCluster(
  text: string,
  clusters: ClusterModel[],
  threshold = CLUSTER_MATCH_THRESHOLD
): { cluster: ClusterModel; score: number } | null {
  const tokens = tokenSet(text);
  if (tokens.size === 0 || clusters.length === 0) return null;
  let best: ClusterModel | null = null;
  let bestScore = 0;
  for (const c of clusters) {
    const score = jaccard(tokens, new Set(c.tokens));
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best || bestScore < threshold) return null;
  return { cluster: best, score: bestScore };
}

export function userDurationFromClusters(
  clusters: ClusterModel[]
): DurationDistribution | null {
  const all: number[] = [];
  for (const c of clusters) {
    all.push(...c.durationSamples);
  }
  if (all.length === 0) return null;
  return durationFromSamples(all, 'median');
}

export function personalMedianMins(clusters: ClusterModel[]): number | null {
  const all: number[] = [];
  for (const c of clusters) all.push(...c.durationSamples);
  const m = median(all);
  return m == null ? null : Math.round(m);
}
