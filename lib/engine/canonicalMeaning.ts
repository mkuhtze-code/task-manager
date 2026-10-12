/**
 * Versioned semantic hand-off contract for post-recognition interpretation.
 *
 * This is an additive boundary type: it records what an upstream interpreter
 * understood so downstream layers can consume it without silently treating
 * the same utterance as fresh, unprovenanced text. It does not grant execution
 * authority; the existing engine and safety gates remain authoritative.
 */

import type { Confidence, EngineRequest } from '@/lib/engine/types';

export const CANONICAL_UTTERANCE_MEANING_VERSION = 1 as const;

export type CanonicalActKind =
  | 'create'
  | 'update'
  | 'complete'
  | 'query'
  | 'defer'
  | 'observe'
  | 'clarify'
  | 'unknown';

export type CanonicalPolarity = 'positive' | 'negative' | 'unknown';
export type CanonicalModality = 'asserted' | 'requested' | 'possible' | 'conditional' | 'reported' | 'unknown';

export type CanonicalAct = {
  id: string;
  kind: CanonicalActKind;
  actionVerb: string | null;
  participants: string[];
  object: string | null;
  location: string | null;
  time: string | null;
  polarity: CanonicalPolarity;
  modality: CanonicalModality;
  confidence: Confidence;
  rawSpan: string | null;
};

export type CanonicalConstraint = {
  axis: 'temporal' | 'spatial' | 'quantity' | 'dependency' | 'urgency' | 'other';
  value: string;
  confidence: Confidence;
  source: string;
};

export type CanonicalUtteranceMeaning = {
  version: typeof CANONICAL_UTTERANCE_MEANING_VERSION;
  rawText: string;
  normalisedText: string;
  acts: CanonicalAct[];
  constraints: CanonicalConstraint[];
  discourse: {
    corrections: string[];
    references: string[];
    conditions: string[];
  };
  safety: {
    mustNotCreateTask: boolean;
    requiresConfirmation: boolean;
    reasons: string[];
  };
  provenance: {
    path: 'speech' | 'typed';
    repairs: string[];
    interpreterId: string;
  };
  confidence: {
    transcription: Confidence;
    interpretation: Confidence;
    action: Confidence;
  };
  /** Optional adapter output. Presence never bypasses downstream authorization. */
  engineRequest?: EngineRequest;
};

const confidenceRank: Record<Confidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/** Runtime guard for external/serialized hand-off values. */
export function isCanonicalUtteranceMeaning(
  value: unknown,
): value is CanonicalUtteranceMeaning {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CanonicalUtteranceMeaning>;
  return candidate.version === CANONICAL_UTTERANCE_MEANING_VERSION
    && typeof candidate.rawText === 'string'
    && typeof candidate.normalisedText === 'string'
    && Array.isArray(candidate.acts)
    && Array.isArray(candidate.constraints)
    && !!candidate.discourse
    && Array.isArray(candidate.discourse.corrections)
    && Array.isArray(candidate.discourse.references)
    && Array.isArray(candidate.discourse.conditions)
    && !!candidate.safety
    && typeof candidate.safety.mustNotCreateTask === 'boolean'
    && typeof candidate.safety.requiresConfirmation === 'boolean'
    && Array.isArray(candidate.safety.reasons)
    && !!candidate.provenance
    && (candidate.provenance.path === 'speech' || candidate.provenance.path === 'typed')
    && Array.isArray(candidate.provenance.repairs)
    && typeof candidate.provenance.interpreterId === 'string'
    && !!candidate.confidence
    && ['low', 'medium', 'high'].includes(candidate.confidence.transcription ?? '')
    && ['low', 'medium', 'high'].includes(candidate.confidence.interpretation ?? '')
    && ['low', 'medium', 'high'].includes(candidate.confidence.action ?? '');
}

/**
 * A deliberately conservative compatibility rule: a downstream adapter may
 * use a supplied request only when the canonical envelope is valid and the
 * action confidence meets the caller's threshold. Safety flags are returned
 * separately and must still be enforced by the decision layer.
 */
export function canonicalRequestCandidate(
  meaning: CanonicalUtteranceMeaning,
  minimumConfidence: Confidence = 'medium',
): EngineRequest | null {
  if (!isCanonicalUtteranceMeaning(meaning)) return null;
  if (confidenceRank[meaning.confidence.action] < confidenceRank[minimumConfidence]) return null;
  if (meaning.safety.mustNotCreateTask || meaning.safety.requiresConfirmation) return null;
  return meaning.engineRequest ?? null;
}
