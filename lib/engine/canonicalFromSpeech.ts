/**
 * Deterministic adapter from the existing speech interpreter into the
 * versioned meaning contract. This records prior interpretation; it does not
 * run a second parser and does not confer execution authority.
 */
import type { SpeechInterpretation } from '@/lib/speech/types';
import type { CanonicalAct, CanonicalConstraint, CanonicalUtteranceMeaning } from './canonicalMeaning';

function canonicalPolarity(value: string): CanonicalAct['polarity'] {
  if (value === 'negated') return 'negative';
  if (value === 'positive') return 'positive';
  return 'unknown';
}

function canonicalKind(kind: string): CanonicalAct['kind'] {
  switch (kind) {
    case 'action':
    case 'commitment':
      return 'create';
    case 'confirmation':
      return 'observe';
    case 'correction':
    case 'retraction':
      return 'update';
    case 'question':
      return 'query';
    case 'condition':
    case 'dependency':
      return 'defer';
    case 'observation':
    case 'reported_speech':
      return 'observe';
    case 'refusal':
      return 'clarify';
    default:
      return 'unknown';
  }
}

/**
 * Use only an interpretation whose transcript corresponds to the current
 * capture line. The caller supplies the exact line that will be docked, which
 * is retained as the canonical raw text for a strict stale-input check.
 */
export function canonicalMeaningFromSpeech(
  interpretation: SpeechInterpretation,
  captureText: string,
): CanonicalUtteranceMeaning {
  const semantic = interpretation.semantic;
  const acts: CanonicalAct[] = (semantic?.acts ?? []).map((act) => {
    const people = (act.entityLinks ?? [])
      .filter((link) => link.kind === 'person')
      .map((link) => link.label);
    const place = (act.entityLinks ?? []).find((link) => link.kind === 'place')?.label ?? null;
    return {
      id: act.id,
      kind: canonicalKind(act.kind),
      actionVerb: act.actionVerb ?? null,
      participants: people,
      object: act.objectText ?? act.subjectText ?? null,
      location: place,
      time: act.temporalRaw ?? null,
      polarity: canonicalPolarity(act.polarity),
      modality: act.condition ? 'conditional' : act.certainty === 'tentative' || act.certainty === 'uncertain' ? 'possible' : 'asserted',
      confidence: act.confidence,
      rawSpan: act.rawSpan ?? null,
      targetsExistingContext: act.targetsExistingContext === true,
      requiresClarification: act.requiresClarification === true,
    };
  });

  const constraints: CanonicalConstraint[] = (interpretation.temporalReferences ?? []).map((time) => ({
    axis: 'temporal',
    value: time.raw,
    confidence: time.confidence,
    source: 'speech.temporalReferences',
  }));
  for (const entity of interpretation.entities ?? []) {
    if (entity.kind === 'place') {
      constraints.push({
        axis: 'spatial',
        value: entity.raw,
        confidence: entity.confidence,
        source: 'speech.entities',
      });
    }
  }

  const mustNotCreateTask =
    interpretation.mustNotCreateTask === true ||
    semantic?.mustNotCreateTask === true ||
    acts.some((act) => act.polarity === 'negative');
  const actionConfidence = interpretation.actionConfidence ?? interpretation.confidence;
  return {
    version: 1,
    rawText: captureText,
    normalisedText: interpretation.normalisedText,
    acts,
    constraints,
    discourse: {
      corrections: (interpretation.corrections ?? []).map((c) => c.correctedRaw),
      references: acts.filter((a) => /^(?:it|that|this|they|them|one)$/i.test(a.object ?? '')).map((a) => a.object as string),
      conditions: acts.filter((a) => a.modality === 'conditional' && a.rawSpan).map((a) => a.rawSpan as string),
    },
    safety: {
      mustNotCreateTask,
      requiresConfirmation: interpretation.requiresConfirmation || semantic?.requiresConfirmation === true,
      reasons: [...(interpretation.reasons ?? []), ...(semantic?.reasons ?? [])],
    },
    provenance: {
      path: 'speech',
      repairs: (interpretation.transcriptRepairs ?? []).map((r) => r.reason),
      interpreterId: 'dokkit-speech-interpretation-v1',
    },
    confidence: {
      transcription: interpretation.transcriptionConfidence ?? 'medium',
      interpretation: interpretation.interpretationConfidence ?? interpretation.confidence,
      action: actionConfidence,
    },
  };
}
