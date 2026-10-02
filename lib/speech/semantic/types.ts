/**
 * Semantic representation — multi-act, evidence-preserving.
 * Detectors (intent, certainty, …) are evidence producers, not the final meaning.
 *
 * RAW transcript remains immutable outside this layer.
 */

import type { Confidence, SpeechCertainty, CommitmentStrength } from '../types';

export type Polarity = 'positive' | 'negated' | 'unknown';

export type ActKind =
  | 'action'
  | 'observation'
  | 'question'
  | 'commitment'
  | 'correction'
  | 'condition'
  | 'dependency'
  | 'retraction'
  | 'reported_speech'
  | 'confirmation'
  | 'refusal'
  | 'unknown';

export type TemporalRelation =
  | 'on'
  | 'by'
  | 'after'
  | 'before'
  | 'until'
  | 'not_before'
  | 'sometime'
  | 'unknown';

export type SemanticEvidence = {
  signal: string;
  source: string;
  span?: string;
  weight?: number;
};

export type CorrectionStep = {
  from: string;
  to: string;
  marker: string;
  facet: 'date' | 'time' | 'entity' | 'action' | 'generic';
  order: number;
};

export type SemanticAct = {
  id: string;
  kind: ActKind;
  rawSpan: string;
  polarity: Polarity;
  actionVerb?: string;
  objectText?: string;
  subjectText?: string;
  sourceSpeaker?: string;
  temporalRaw?: string;
  temporalRelation?: TemporalRelation;
  certainty?: SpeechCertainty;
  commitment?: CommitmentStrength;
  conditionSpan?: string;
  dependencySpan?: string;
  evidence: SemanticEvidence[];
  confidence: Confidence;
  blocksTaskCreation: boolean;
};

export type SemanticUtterance = {
  rawText: string;
  normalisedText: string;
  acts: SemanticAct[];
  correctionChain: CorrectionStep[];
  mustNotCreateTask: boolean;
  requiresConfirmation: boolean;
  reasons: string[];
  confidence: Confidence;
};

export function makeActId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
