import type { SemanticInterpretation } from '@/lib/engine/semanticInterpreter';
import type { SpeechInterpretation } from '@/lib/speech/types';
import type { SemanticAct } from '@/lib/speech/semantic/types';
import type { SemanticEnvelope, SemanticEnvelopeAct, SemanticEnvelopeSource } from './envelope';

function speechActToEnvelope(
  act: SemanticAct,
  source: SemanticEnvelopeSource
): SemanticEnvelopeAct {
  return {
    id: act.id,
    kind: act.kind,
    rawSpan: act.rawSpan,
    polarity: act.polarity,
    actionVerb: act.actionVerb ?? null,
    objectText: act.objectText ?? null,
    subjectText: act.subjectText ?? null,
    sourceSpeaker: act.sourceSpeaker ?? null,
    temporalRaw: act.temporalRaw ?? null,
    temporalRelation: act.temporalRelation ?? null,
    temporalResolvedDate: act.temporalResolvedDate ?? null,
    certainty: act.certainty ?? null,
    commitment: act.commitment ?? null,
    condition: act.condition ?? null,
    dependency: act.dependency ?? null,
    references: (act.references ?? []).map((reference) => ({
      ...reference,
      candidateIds: [...reference.candidateIds],
    })),
    entityLinks: (act.entityLinks ?? []).map((link) => ({
      entityId: link.entityId,
      label: link.label,
      kind: link.kind,
      confidence: link.confidence,
    })),
    corrections: (act.corrections ?? []).map((correction) => ({ ...correction })),
    evidence: act.evidence.map((item) => ({ ...item })),
    confidence: act.confidence,
    blocksTaskCreation: act.blocksTaskCreation,
    requiresClarification: act.requiresClarification ?? false,
    targetsExistingContext: act.targetsExistingContext ?? false,
    provenance: {
      system: source.system,
      sourceActId: act.id,
    },
  };
}

/**
 * Adapt the speech representation without flattening acts or action policy.
 * No decision is made about whether a proposed action should execute.
 */
export function fromSpeechInterpretation(
  interpretation: SpeechInterpretation,
  inputKind: 'typed' | 'speech' = 'speech'
): SemanticEnvelope {
  const semantic = interpretation.semantic;
  const source: SemanticEnvelopeSource = {
    kind: inputKind,
    system: 'speech-pipeline',
    rawText: interpretation.originalTranscript,
    normalizedText: interpretation.normalisedText,
    interpretationId: interpretation.id,
    transcriptionConfidence: interpretation.transcriptionConfidence,
  };
  const acts = (semantic?.acts ?? []).map((act) => speechActToEnvelope(act, source));
  return {
    contract: 'dokkit.semantic-envelope',
    version: 1,
    source,
    acts,
    correctionChain: (semantic?.correctionChain ?? []).map((correction) => ({ ...correction })),
    constraints: interpretation.constraints.map((constraint) => ({
      kind: String(constraint),
      value: String(constraint),
      source: 'speech-interpretation',
    })),
    context: {
      speechAct: interpretation.statementType,
      intent: interpretation.intent,
      certainty: interpretation.certainty,
      commitment: interpretation.commitmentStrength,
      urgency: interpretation.urgency,
      dateHint: null,
      timeHint: null,
      relatedJobText: null,
      relatedMeetingText: null,
      isRefinement: false,
      isCorrection: (semantic?.correctionChain.length ?? 0) > 0 || interpretation.corrections.length > 0,
      mustNotCreateTask: semantic?.mustNotCreateTask ?? interpretation.mustNotCreateTask ?? false,
      requiresConfirmation: semantic?.requiresConfirmation ?? interpretation.requiresConfirmation,
      confidence: semantic?.confidence ?? interpretation.confidence,
      evidence: [...interpretation.reasons, ...(semantic?.reasons ?? [])],
    },
    provenance: {
      semanticProducer: 'speech-pipeline',
      adapterVersion: 1,
      lossyProjection: false,
      lossNotes: [],
    },
  };
}

/**
 * Adapt the task-oriented engine projection into the common envelope.
 * This is explicitly marked lossy: its single frame cannot reconstruct
 * multi-act speech meaning, source spans, or omitted relations.
 */
export function fromEngineInterpretation(
  interpretation: SemanticInterpretation,
  inputKind: 'typed' | 'engine' = 'typed'
): SemanticEnvelope {
  const hasMeaning =
    interpretation.primaryVerb !== null ||
    interpretation.objectText !== null ||
    interpretation.subjectText !== null ||
    interpretation.purposeText !== null ||
    interpretation.locationText !== null;
  const act: SemanticEnvelopeAct[] = hasMeaning
    ? [{
        id: `engine:${interpretation.version}:${interpretation.normalizedText}`,
        kind: interpretation.speechAct === 'question'
          ? 'question'
          : interpretation.speechAct === 'observation'
            ? 'observation'
            : interpretation.isCorrection
              ? 'correction'
              : interpretation.intent === 'unknown' ? 'unknown' : 'action',
        rawSpan: interpretation.rawText,
        polarity: 'unknown',
        actionVerb: interpretation.primaryVerb,
        objectText: interpretation.objectText,
        subjectText: interpretation.subjectText,
        sourceSpeaker: interpretation.personText,
        temporalRaw: [interpretation.dateHint, interpretation.timeHint].filter(Boolean).join(' ') || null,
        temporalRelation: null,
        temporalResolvedDate: interpretation.dateHint,
        certainty: null,
        commitment: null,
        condition: null,
        dependency: null,
        references: interpretation.reference ? [{
          pronoun: interpretation.reference.phrase,
          resolvedTo: interpretation.reference.targetId,
          candidateIds: interpretation.reference.candidates.map((candidate) => candidate.id),
          confidence: interpretation.confidence,
          requiresClarification: interpretation.reference.status === 'ambiguous',
        }] : [],
        entityLinks: [],
        corrections: [],
        evidence: interpretation.evidence.map((signal) => ({
          signal,
          source: 'engine-interpreter',
        })),
        confidence: interpretation.confidence,
        blocksTaskCreation: interpretation.intent === 'unknown' || interpretation.speechAct === 'question',
        requiresClarification: interpretation.reference?.status === 'ambiguous',
        targetsExistingContext: interpretation.isRefinement,
        provenance: {
          system: 'engine-interpreter',
          sourceActId: `engine:${interpretation.version}:${interpretation.normalizedText}`,
        },
      }]
    : [];

  return {
    contract: 'dokkit.semantic-envelope',
    version: 1,
    source: {
      kind: inputKind,
      system: 'engine-interpreter',
      rawText: interpretation.rawText,
      normalizedText: interpretation.normalizedText,
    },
    acts: act,
    correctionChain: [],
    constraints: interpretation.grammar.relations.map((relation) => ({
      kind: 'grammar_relation',
      value: String(relation),
      source: 'engine-semantic-grammar',
    })),
    context: {
      speechAct: interpretation.speechAct,
      intent: interpretation.intent,
      certainty: null,
      commitment: null,
      urgency: null,
      dateHint: interpretation.dateHint,
      timeHint: interpretation.timeHint,
      relatedJobText: interpretation.relatedJobText,
      relatedMeetingText: interpretation.relatedMeetingText,
      isRefinement: interpretation.isRefinement,
      isCorrection: interpretation.isCorrection,
      mustNotCreateTask: interpretation.intent === 'unknown',
      requiresConfirmation: interpretation.confidence !== 'high',
      confidence: interpretation.confidence,
      evidence: [...interpretation.evidence],
    },
    provenance: {
      semanticProducer: 'engine-interpreter',
      adapterVersion: 1,
      lossyProjection: true,
      lossNotes: [
        'Engine interpretation is a single task-oriented frame, not a multi-act semantic source.',
        'Polarity, conditions, dependencies, temporal relations, entity links and source-act boundaries are not recoverable when absent from the engine projection.',
      ],
    },
  };
}
