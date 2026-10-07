/**
 * Phase 2 — deterministic evidence and belief graph.
 *
 * Beliefs are derived from evidence; they are never treated as raw facts.
 * Stronger evidence supersedes weaker evidence for the same scoped key.
 * No LLM, no probabilistic model, no mutation of domain state.
 */

import type { Confidence, EngineRequest, LearningEvidence } from '@/lib/engine';

export type EvidenceStrength = 1 | 2 | 3 | 4 | 5;
// 5 explicit correction, 4 explicit user statement, 3 observed outcome,
// 2 repeated pattern / learned signal, 1 inference / generic prior.

export type EvidenceRef = {
  id: string;
  kind: LearningEvidence['kind'];
  strength: EvidenceStrength;
  timestamp: string;
  requestId: string | null;
  source: string;
};

export type Belief = {
  id: string;
  key: string;
  value: string;
  confidence: Confidence;
  strength: EvidenceStrength;
  createdAt: string;
  updatedAt: string;
  scope: {
    userId: string | null;
    requestId: string | null;
  };
  supportingEvidence: EvidenceRef[];
  contradictingEvidence: EvidenceRef[];
  supersedes: string[];
};

export type BeliefGraph = {
  version: 1;
  updatedAt: string;
  beliefs: Belief[];
};

const MAX_BELIEFS = 200;
const MAX_EVIDENCE_PER_BELIEF = 8;

function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function strengthForEvidence(e: LearningEvidence): EvidenceStrength {
  if (e.kind === 'correction') return 5;
  if (e.kind === 'outcome') return 3;
  if (e.kind === 'acceptance' || e.kind === 'rejection') return 3;
  if (e.kind === 'interpretation') {
    return e.payload.source === 'correction' || e.payload.isCorrection ? 5 : 4;
  }
  if (e.kind === 'reference_resolved') return 4;
  return 4;
}

function confidenceForStrength(strength: EvidenceStrength): Confidence {
  if (strength >= 4) return 'high';
  if (strength >= 3) return 'medium';
  return 'low';
}

function makeRef(e: LearningEvidence): EvidenceRef {
  return {
    id: e.id,
    kind: e.kind,
    strength: strengthForEvidence(e),
    timestamp: e.timestamp,
    requestId: e.requestId,
    source: typeof e.payload.source === 'string' ? e.payload.source : e.kind,
  };
}

function addEvidence(
  belief: Belief,
  ref: EvidenceRef,
  supports: boolean
): Belief {
  const field = supports ? 'supportingEvidence' : 'contradictingEvidence';
  const existing = belief[field].filter((e) => e.id !== ref.id);
  const next = [ref, ...existing].sort(
    (a, b) => b.strength - a.strength || b.timestamp.localeCompare(a.timestamp)
  ).slice(0, MAX_EVIDENCE_PER_BELIEF);

  return {
    ...belief,
    [field]: next,
    updatedAt: ref.timestamp,
  };
}

function beliefId(userId: string | null, key: string): string {
  return `belief_${hash(`${userId ?? 'anonymous'}|${key}`)}`;
}

function upsertBelief(
  graph: BeliefGraph,
  userId: string | null,
  key: string,
  value: string,
  ref: EvidenceRef,
  supports = true
): BeliefGraph {
  const id = beliefId(userId, key);
  const current = graph.beliefs.find((b) => b.id === id);
  const strength = ref.strength;

  if (!current) {
    const belief: Belief = {
      id,
      key,
      value,
      confidence: confidenceForStrength(strength),
      strength,
      createdAt: ref.timestamp,
      updatedAt: ref.timestamp,
      scope: { userId, requestId: ref.requestId },
      supportingEvidence: supports ? [ref] : [],
      contradictingEvidence: supports ? [] : [ref],
      supersedes: [],
    };
    return {
      ...graph,
      beliefs: [belief, ...graph.beliefs].slice(0, MAX_BELIEFS),
      updatedAt: ref.timestamp,
    };
  }

  // A contradiction does not erase the previous belief. It becomes evidence
  // against it. A stronger/newer correction can replace the active value.
  const shouldReplace =
    supports &&
    (strength > current.strength ||
      (strength === current.strength && ref.timestamp >= current.updatedAt));

  const next = addEvidence(current, ref, supports);
  if (shouldReplace && value !== current.value) {
    return {
      ...graph,
      beliefs: graph.beliefs.map((b) =>
        b.id === id
          ? {
              ...next,
              value,
              strength,
              confidence: confidenceForStrength(strength),
              supersedes: [...b.supersedes, b.value].slice(-8),
              scope: { ...b.scope, requestId: ref.requestId ?? b.scope.requestId },
            }
          : b
      ),
      updatedAt: ref.timestamp,
    };
  }

  return {
    ...graph,
    beliefs: graph.beliefs.map((b) => (b.id === id ? next : b)),
    updatedAt: ref.timestamp,
  };
}

function requestEvidence(
  request: EngineRequest,
  evidence: LearningEvidence[],
): EvidenceRef | null {
  const matching = evidence.filter((e) => e.requestId === request.id);
  const ref = matching
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .find((e) => e.kind === 'correction' || e.kind === 'interpretation');
  return ref ? makeRef(ref) : null;
}

/**
 * Update the graph from the current request and its evidence.
 *
 * The graph deliberately records structured request facts rather than every
 * token. This keeps it useful as a belief layer instead of becoming another
 * transcript/memory store.
 */
export function updateBeliefGraph(
  previous: BeliefGraph,
  userId: string | null,
  request: EngineRequest,
  evidence: LearningEvidence[]
): BeliefGraph {
  let graph = previous;
  const fields: Array<keyof Pick<
    EngineRequest,
    'objectText' | 'locationText' | 'relatedJobText' | 'relatedMeetingText' |
    'dateHint' | 'timeHint' | 'urgency' | 'flexibility' | 'commitment'
  >> = [
    'objectText',
    'locationText',
    'relatedJobText',
    'relatedMeetingText',
    'dateHint',
    'timeHint',
    'urgency',
    'flexibility',
    'commitment',
  ];

  for (const field of fields) {
    const value = request[field];
    if (value === null || value === undefined || value === '') continue;
    const ref = requestEvidence(request, evidence);
    if (!ref) continue;
    graph = upsertBelief(
      graph,
      userId,
      `request.${field}`,
      String(value),
      ref,
      true
    );
  }

  for (const constraint of request.constraints) {
    const ref = evidence
      .filter((e) => e.requestId === request.id)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    if (!ref) continue;
    graph = upsertBelief(
      graph,
      userId,
      `constraint.${constraint.axis}`,
      constraint.value,
      makeRef(ref),
      true
    );
  }

  return graph;
}

export function emptyBeliefGraph(): BeliefGraph {
  return { version: 1, updatedAt: new Date(0).toISOString(), beliefs: [] };
}

export function activeBelief(
  graph: BeliefGraph,
  key: string
): Belief | null {
  return graph.beliefs.find((b) => b.key === key) ?? null;
}
