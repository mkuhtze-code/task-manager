/**
 * Versioned, domain-neutral semantic envelope.
 *
 * This is an evidence-preserving interchange contract, not an execution
 * request. It deliberately does not choose which interpretation is correct.
 */
/**
 * Contract-owned primitives. This module intentionally imports no producer
 * contract so speech and engine remain replaceable evidence sources.
 */
export type SemanticConfidence = 'low' | 'medium' | 'high';
export type SemanticActKind =
  | 'action' | 'observation' | 'question' | 'commitment' | 'correction'
  | 'condition' | 'dependency' | 'retraction' | 'reported_speech'
  | 'confirmation' | 'refusal' | 'unknown';
export type SemanticPolarity = 'positive' | 'negated' | 'unknown';
export type SemanticTemporalRelation =
  | 'on' | 'by' | 'after' | 'before' | 'until' | 'not_before' | 'sometime' | 'unknown';
export type SemanticCorrection = {
  from: string;
  to: string;
  marker: string;
  facet: 'date' | 'time' | 'entity' | 'action' | 'generic';
  order: number;
  actId?: string;
};
export type SemanticReference = {
  pronoun: string;
  resolvedTo: string | null;
  candidateIds: string[];
  confidence: SemanticConfidence;
  requiresClarification: boolean;
};
export type SemanticCondition = {
  raw: string;
  kind: 'if' | 'unless' | 'when' | 'unknown';
  confidence: SemanticConfidence;
};
export type SemanticDependency = {
  raw: string;
  kind: 'after' | 'before' | 'until' | 'once' | 'unknown';
  confidence: SemanticConfidence;
};
export type SemanticEvidence = {
  signal: string;
  source: string;
  span?: string;
  weight?: number;
};

export type SemanticInputKind = 'typed' | 'speech' | 'engine';

export type SemanticEnvelopeSource = {
  kind: SemanticInputKind;
  system: 'speech-pipeline' | 'engine-interpreter';
  rawText: string;
  normalizedText: string;
  interpretationId?: string;
  transcriptionSemanticConfidence?: SemanticConfidence;
};

export type SemanticEnvelopeAct = {
  id: string;
  kind: SemanticActKind;
  rawSpan: string;
  polarity: SemanticPolarity;
  actionVerb: string | null;
  objectText: string | null;
  subjectText: string | null;
  sourceSpeaker: string | null;
  temporalRaw: string | null;
  temporalRelation: SemanticTemporalRelation | null;
  temporalResolvedDate: string | null;
  certainty: string | null;
  commitment: string | null;
  condition: SemanticCondition | null;
  dependency: SemanticDependency | null;
  references: SemanticReference[];
  entityLinks: Array<{
    entityId: string;
    label: string;
    kind: string;
    confidence?: SemanticConfidence;
  }>;
  corrections: SemanticCorrection[];
  evidence: SemanticEvidence[];
  confidence: SemanticConfidence;
  blocksTaskCreation: boolean;
  requiresClarification: boolean;
  targetsExistingContext: boolean;
  provenance: {
    system: SemanticEnvelopeSource['system'];
    sourceActId: string;
  };
};

export type SemanticEnvelope = {
  contract: 'dokkit.semantic-envelope';
  version: 1;
  source: SemanticEnvelopeSource;
  acts: SemanticEnvelopeAct[];
  correctionChain: SemanticCorrection[];
  entities: Array<{
    raw: string;
    kind: string;
    resolvedId: string | null;
    confidence: SemanticConfidence;
    wasCorrected: boolean;
    provenance: string;
  }>;
  temporalExpressions: Array<{
    raw: string;
    kind: string;
    resolvedDate: string | null;
    resolvedTime: string | null;
    isCorrection: boolean;
    confidence: SemanticConfidence;
    provenance: string;
  }>;
  relations: Array<{
    kind: string;
    sourceActId: string | null;
    target: string | null;
    raw: string;
    confidence: SemanticConfidence | null;
    provenance: string;
  }>;
  constraints: Array<{
    kind: string;
    value: string;
    source: string;
  }>;
  context: {
    speechAct: string | null;
    intent: string | null;
    certainty: string | null;
    commitment: string | null;
    urgency: string | null;
    dateHint: string | null;
    timeHint: string | null;
    relatedJobText: string | null;
    relatedMeetingText: string | null;
    isRefinement: boolean;
    isCorrection: boolean;
    mustNotCreateTask: boolean;
    requiresConfirmation: boolean;
    confidence: SemanticConfidence;
    evidence: string[];
  };
  provenance: {
    semanticProducer: SemanticEnvelopeSource['system'];
    adapterVersion: 1;
    lossyProjection: boolean;
    lossNotes: string[];
  };
};
