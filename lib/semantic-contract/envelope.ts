/**
 * Versioned, domain-neutral semantic envelope.
 *
 * This is an evidence-preserving interchange contract, not an execution
 * request. It deliberately does not choose which interpretation is correct.
 */
import type { Confidence } from '@/lib/engine/types';
import type {
  ActKind,
  CorrectionStep,
  Polarity,
  ReferenceResolution,
  SemanticCondition,
  SemanticDependency,
  SemanticEvidence,
  TemporalRelation,
} from '@/lib/speech/semantic/types';
import type { SpeechCertainty, CommitmentStrength } from '@/lib/speech/types';

export type SemanticInputKind = 'typed' | 'speech' | 'engine';

export type SemanticEnvelopeSource = {
  kind: SemanticInputKind;
  system: 'speech-pipeline' | 'engine-interpreter';
  rawText: string;
  normalizedText: string;
  interpretationId?: string;
  transcriptionConfidence?: Confidence;
};

export type SemanticEnvelopeAct = {
  id: string;
  kind: ActKind;
  rawSpan: string;
  polarity: Polarity;
  actionVerb: string | null;
  objectText: string | null;
  subjectText: string | null;
  sourceSpeaker: string | null;
  temporalRaw: string | null;
  temporalRelation: TemporalRelation | null;
  temporalResolvedDate: string | null;
  certainty: SpeechCertainty | null;
  commitment: CommitmentStrength | null;
  condition: SemanticCondition | null;
  dependency: SemanticDependency | null;
  references: ReferenceResolution[];
  entityLinks: Array<{
    entityId: string;
    label: string;
    kind: string;
    confidence?: Confidence;
  }>;
  corrections: CorrectionStep[];
  evidence: SemanticEvidence[];
  confidence: Confidence;
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
  correctionChain: CorrectionStep[];
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
    confidence: Confidence;
    evidence: string[];
  };
  provenance: {
    semanticProducer: SemanticEnvelopeSource['system'];
    adapterVersion: 1;
    lossyProjection: boolean;
    lossNotes: string[];
  };
};
