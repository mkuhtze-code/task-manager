/**
 * Semantic representation — multi-act, evidence-preserving.
 * Detectors are evidence producers; acts are the primary unit of meaning.
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
  actId?: string;
};

export type SemanticCondition = {
  raw: string;
  kind: 'if' | 'unless' | 'when' | 'unknown';
  confidence: Confidence;
};

export type SemanticDependency = {
  raw: string;
  kind: 'after' | 'before' | 'until' | 'once' | 'unknown';
  confidence: Confidence;
};

export type ReferenceResolution = {
  pronoun: string;
  resolvedTo: string | null;
  candidateIds: string[];
  confidence: Confidence;
  requiresClarification: boolean;
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
  temporalResolvedDate?: string | null;
  certainty?: SpeechCertainty;
  commitment?: CommitmentStrength;
  condition?: SemanticCondition;
  dependency?: SemanticDependency;
  references?: ReferenceResolution[];
  entityLinks?: import('./context').EntityLink[];
  corrections?: CorrectionStep[];
  evidence: SemanticEvidence[];
  confidence: Confidence;
  blocksTaskCreation: boolean;
  requiresClarification?: boolean;
  targetsExistingContext?: boolean;
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

export type SemanticActionOutcome =
  | 'CREATE_TASK'
  | 'CREATE_MULTIPLE_TASKS'
  | 'DO_NOT_CREATE'
  | 'ASK_CLARIFICATION'
  | 'UPDATE_EXISTING_CONTEXT'
  | 'RECORD_OBSERVATION'
  | 'NOTE_REPORTED';

export function makeActId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
