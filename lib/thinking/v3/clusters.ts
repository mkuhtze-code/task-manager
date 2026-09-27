// lib/thinking/v3/clusters.ts
//
// Phase 5.5 — hardened clustering.
//
// - Generic verb/noun downweighting
// - Discriminative weighted Jaccard
// - Prototype tokens (bounded expansion)
// - Order-independent sample sort
// - Contaminated duration exclusion
// - Timezone-aware same-day via temporal module
//
// Pure. Deterministic. No network.

import {
  durationFromSamples,
  consistencyScore,
  median,
} from './stats';
import type { DurationDistribution } from './types';
import { sameLocalCalendarDay } from './temporal';

export const CLUSTER_MATCH_THRESHOLD = 0.45;
export const CLUSTER_VERSION = 2;
export const PROTOTYPE_MAX_TOKENS = 8;
export const JOIN_THRESHOLD = 0.45;
export const COHERENCE_FLOOR = 0.35;

export const GENERIC_TOKENS = new Set([
  'call', 'email', 'review', 'check', 'fix', 'update', 'send', 'write',
  'read', 'look', 'get', 'set', 'make', 'do', 'go', 'see', 'need', 'work',
  'task', 'item', 'thing', 'stuff', 'job', 'done', 'finish', 'start',
  'quick', 'small', 'new', 'old', 'today', 'tomorrow', 'please', 'just',
  'deal', 'sort', 'handle', 'process', 'follow', 'up', 'with', 'from',
  'about', 'into', 'over', 'out', 'off', 'and', 'the', 'for', 'to',
]);

export type HistorySample = {
  text: string;
  actualMins: number | null;
  createdAt?: string | null;
  completedAt?: string | null;
  jobId?: string | null;
  locationText?: string | null;
  taskId?: string | null;
  durationContaminated?: boolean;
};

export type ClusterModel = {
  clusterId: string;
  label: string;
  version: number;
  tokens: string[];
  tokenWeights: Record<string, number>;
  sampleCount: number;
  durationSamples: number[];
  duration: DurationDistribution | null;
  sameDayRate: number | null;
  sameDaySamples: number;
  consistency: number | null;
  coherence: number | null;
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

export function tokenWeight(token: string): number {
  if (GENERIC_TOKENS.has(token.toLowerCase())) return 0.25;
  if (token.length <= 2) return 0.5;
  return 1;
}

export function discriminativeTokens(text: string): string[] {
  return tokenize(text).filter((t) => !GENERIC_TOKENS.has(t));
}

export function weightedJaccard(a: Iterable<string>, b: Iterable<string>): number {
  const sa = new Set([...a].map((t) => t.toLowerCase()));
  const sb = new Set([...b].map((t) => t.toLowerCase()));
  if (sa.size === 0 || sb.size === 0) return 0;
  let interW = 0;
  let unionW = 0;
  const all = new Set([...sa, ...sb]);
  for (const t of all) {
    const w = tokenWeight(t);
    unionW += w;
    if (sa.has(t) && sb.has(t)) interW += w;
  }
  if (unionW === 0) return 0;
  return interW / unionW;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

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
  const disc = tokens.filter((t) => !GENERIC_TOKENS.has(t));
  const pool = disc.length > 0 ? disc : tokens;
  const sorted = [...pool].sort(
    (a, b) => b.length - a.length || a.localeCompare(b)
  );
  return sorted.slice(0, 3).join(' ') || 'misc';
}

function stableSampleKey(s: HistorySample): string {
  return [
    s.text.toLowerCase().trim(),
    s.createdAt ?? '',
    s.completedAt ?? '',
    s.jobId ?? '',
    s.taskId ?? '',
  ].join('\0');
}

function prototypeFromWeights(weights: Record<string, number>): string[] {
  return Object.entries(weights)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, PROTOTYPE_MAX_TOKENS)
    .map(([t]) => t);
}

function addTokenWeights(
  weights: Record<string, number>,
  tokens: Iterable<string>
): void {
  for (const t of tokens) {
    const k = t.toLowerCase();
    weights[k] = (weights[k] ?? 0) + tokenWeight(k);
  }
}

export function buildClusterModels(
  samples: HistorySample[],
  opts?: { matchThreshold?: number; timezone?: string }
): ClusterModel[] {
  const threshold = opts?.matchThreshold ?? JOIN_THRESHOLD;
  const timezone = opts?.timezone ?? 'UTC';

  const ordered = [...samples].sort((a, b) =>
    stableSampleKey(a).localeCompare(stableSampleKey(b))
  );

  type Acc = {
    weights: Record<string, number>;
    prototype: string[];
    texts: string[];
    durationSamples: number[];
    sameDayHits: number;
    sameDayTotal: number;
    memberScores: number[];
  };
  const groups: Acc[] = [];

  for (const sample of ordered) {
    const tokens = tokenize(sample.text);
    if (tokens.length === 0) continue;
    const disc = discriminativeTokens(sample.text);

    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < groups.length; i++) {
      const score = weightedJaccard(
        disc.length > 0 ? disc : tokens,
        groups[i].prototype
      );
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const canJoin =
      bestIdx >= 0 &&
      bestScore >= threshold &&
      (disc.length === 0 ||
        groups[bestIdx].prototype.some((t) => !GENERIC_TOKENS.has(t)) === false ||
        weightedJaccard(
          disc,
          groups[bestIdx].prototype.filter((t) => !GENERIC_TOKENS.has(t))
        ) >= COHERENCE_FLOOR ||
        bestScore >= 0.6);

    if (canJoin && bestIdx >= 0) {
      const g = groups[bestIdx];
      addTokenWeights(g.weights, tokens);
      g.prototype = prototypeFromWeights(g.weights);
      g.texts.push(sample.text);
      g.memberScores.push(bestScore);
      if (
        sample.actualMins != null &&
        sample.actualMins > 0 &&
        !sample.durationContaminated
      ) {
        g.durationSamples.push(sample.actualMins);
      }
      if (sample.createdAt && sample.completedAt) {
        g.sameDayTotal++;
        if (sameLocalCalendarDay(sample.createdAt, sample.completedAt, timezone)) {
          g.sameDayHits++;
        }
      }
    } else {
      const weights: Record<string, number> = {};
      addTokenWeights(weights, tokens);
      const durationSamples =
        sample.actualMins != null &&
        sample.actualMins > 0 &&
        !sample.durationContaminated
          ? [sample.actualMins]
          : [];
      let sameDayHits = 0;
      let sameDayTotal = 0;
      if (sample.createdAt && sample.completedAt) {
        sameDayTotal = 1;
        if (sameLocalCalendarDay(sample.createdAt, sample.completedAt, timezone)) {
          sameDayHits = 1;
        }
      }
      groups.push({
        weights,
        prototype: prototypeFromWeights(weights),
        texts: [sample.text],
        durationSamples,
        sameDayHits,
        sameDayTotal,
        memberScores: [1],
      });
    }
  }

  return groups.map((g) => {
    const tokenList = g.prototype.slice().sort();
    const duration =
      g.durationSamples.length > 0
        ? durationFromSamples(g.durationSamples, 'median')
        : null;
    const coherence =
      g.memberScores.length > 0
        ? g.memberScores.reduce((a, b) => a + b, 0) / g.memberScores.length
        : null;
    return {
      clusterId: clusterIdFromTokens(tokenList),
      label: labelFromTokens(tokenList),
      version: CLUSTER_VERSION,
      tokens: tokenList,
      tokenWeights: { ...g.weights },
      sampleCount: g.texts.length,
      durationSamples: g.durationSamples,
      duration,
      sameDayRate:
        g.sameDayTotal >= 2 ? g.sameDayHits / g.sameDayTotal : null,
      sameDaySamples: g.sameDayTotal,
      consistency: consistencyScore(g.durationSamples),
      coherence,
    };
  });
}

export function matchCluster(
  text: string,
  clusters: ClusterModel[],
  threshold = CLUSTER_MATCH_THRESHOLD
): { cluster: ClusterModel; score: number } | null {
  const disc = discriminativeTokens(text);
  const tokens = disc.length > 0 ? disc : tokenize(text);
  if (tokens.length === 0 || clusters.length === 0) return null;
  let best: ClusterModel | null = null;
  let bestScore = 0;
  for (const c of clusters) {
    const score = weightedJaccard(tokens, c.tokens);
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
