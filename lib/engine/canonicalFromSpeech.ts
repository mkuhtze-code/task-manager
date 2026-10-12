/**
 * Explicit adapter from the existing deterministic speech contract to the
 * versioned post-recognition contract. This adapter translates existing
 * evidence; it does not infer new intent or authorize execution.
 */

import type { SpeechInterpretation } from '@/lib/speech/types';
import type { SemanticAct } from '@/lib/speech/semantic/types';
import {
  CANONICAL_UTTERANCE_MEANING_VERSION,
  type CanonicalAct,
  type CanonicalConstraint,
  type CanonicalUtteranceMeaning,
} from './canonicalMeaning';

function actKind(act: SemanticAct): CanonicalAct['kind'] {
  if (act.kind === 'question') return 'query';
  if (act.kind === 'observation' || act.kind === 'reported_speech') return 'observe';
  if (act.kind === 'correction' || act.kind === 'retraction') return 'update';
  if (act.kind === 'refusal' || act.kind === 'condition' || act.kind === 'dependency') return 'unknown';
  if (act.kind === 'action' || act.kind === 'commitment') {
    return act.targetsExistingContext ? 'update' : 'create';
  }
  return 'unknown';
}

function canonicalAct(act: SemanticAct): CanonicalAct {
  return {
    id: act.id,
    kind: actKind(act),
    actionVerb: act.actionVerb ?? null,
    participants: [
      ...(act.sourceSpeaker ? [act.sourceSpeaker] : []),
      ...(act.entityLinks ?? []).map((link) => link.label),
    ],
    object: act.objectText ?? act.subjectText ?? null,
    location: (act.entityLinks ?? []).find((link) => link.kind === 'place')?.label ?? null,
    time: act.temporalRaw ?? null,
    polarity: act.polarity === 'positive' ? 'positive' : act.polarity === 'negated' ? 'negative' : 'unknown',
    modality: act.condition ? 'conditional' : act.certainty === 'speculative' || act.certainty === 'tentative' ? 'possible' : 'requested',
    confidence: act.confidence,
    rawSpan: act.rawSpan ?? null,
  };
}

function constraintsFrom(acts: SemanticAct[]): CanonicalConstraint[] {
  const constraints: CanonicalConstraint[] = [];
  for (const act of acts) {
    if (act.temporalRaw) {
      constraints.push({
        axis: 'temporal',
        value: act.temporalResolvedDate ?? act.temporalRaw,
        confidence: act.confidence,
        source: `speech-act:${act.id}:temporal`,
      });
    }
    if (act.dependency) {
      constraints.push({
        axis: 'dependency',
        value: act.dependency.raw,
        confidence: act.dependency.confidence,
        source: `speech-act:${act.id}:dependency`,
      });
    }
    if (act.condition) {
      constraints.push({
        axis: 'other',
        value: act.condition.raw,
        confidence: act.condition.confidence,
        source: `speech-act:${act.id}:condition`,
      });
    }
    for (const link of act.entityLinks ?? []) {
      if (link.kind === 'place') {
        constraints.push({
          axis: 'spatial',
          value: link.label,
          confidence: link.confidence,
          source: `speech-act:${act.id}:entity`,
        });
      }
    }
  }
  return constraints;
}

export function canonicalMeaningFromSpeech(
  interpretation: SpeechInterpretation,
): CanonicalUtteranceMeaning {
  const semantic = interpretation.semantic;
  const acts = semantic?.acts ?? [];
  const repairs = (interpretation.transcriptRepairs ?? []).map(
    (repair) => `${repair.original} → ${repair.replacement} (${repair.reason})`,
  );

  return {
    version: CANONICAL_UTTERANCE_MEANING_VERSION,
    rawText: interpretation.originalTranscript,
    normalisedText: interpretation.normalisedText,
    acts: acts.map(canonicalAct),
    constraints: constraintsFrom(acts),
    discourse: {
      corrections: [
        ...(semantic?.correctionChain ?? []).map((step) => `${step.from} → ${step.to}`),
        ...interpretation.corrections.map((step) => `${step.originalRaw} → ${step.correctedRaw}`),
      ],
      references: acts.flatMap((act) => (act.references ?? []).map((ref) => ref.resolvedTo ?? ref.pronoun)),
      conditions: acts.flatMap((act) => act.condition ? [act.condition.raw] : []),
    },
    safety: {
      mustNotCreateTask: interpretation.mustNotCreateTask ?? semantic?.mustNotCreateTask ?? false,
      requiresConfirmation: interpretation.requiresConfirmation || semantic?.requiresConfirmation === true,
      reasons: [...new Set([...(interpretation.reasons ?? []), ...(semantic?.reasons ?? [])])],
    },
    provenance: {
      path: 'speech',
      repairs,
      interpreterId: 'dokkit-speech-semantic-adapter-v1',
    },
    confidence: {
      transcription: interpretation.transcriptionConfidence ?? 'medium',
      interpretation: interpretation.interpretationConfidence ?? interpretation.confidence,
      action: interpretation.actionConfidence ?? interpretation.confidence,
    },
  };
}
