import type { SemanticEnvelope } from './envelope';

/**
 * Phase N shadow-only comparison.
 *
 * This module exposes evidence and disagreements between semantic producers.
 * It does not merge interpretations, select a winner, resolve ambiguity, or
 * authorize capture/task mutations. A null value means the producer's current
 * envelope cannot represent the signal; it must not be treated as false.
 */
export const SHADOW_SIGNALS = [
  'action',
  'question',
  'observation',
  'negation',
  'correction',
  'condition',
  'dependency',
  'temporal',
  'entity',
  'reference',
  'multiple_acts',
  'blocks_task_creation',
  'requires_clarification',
] as const;

export type ShadowSignal = typeof SHADOW_SIGNALS[number];
export type ShadowSignalValue = boolean | null;
export type ShadowComparisonStatus = 'agree' | 'disagree' | 'not_comparable' | 'different_input';

export type ShadowSignalObservation = {
  signal: ShadowSignal;
  value: ShadowSignalValue;
  producer: SemanticEnvelope['source']['system'];
  adapterVersion: number;
  lossyProjection: boolean;
};

export type ShadowSignalComparison = {
  signal: ShadowSignal;
  speech: ShadowSignalObservation;
  engine: ShadowSignalObservation;
  status: ShadowComparisonStatus;
};

export type SemanticShadowComparison = {
  contract: 'dokkit.semantic-shadow-comparison';
  version: 1;
  input: {
    sameUtterance: boolean;
    speechText: string;
    engineText: string;
  };
  comparisons: ShadowSignalComparison[];
  summary: {
    comparable: number;
    agreements: number;
    disagreements: number;
    notComparable: number;
    differentInput: number;
  };
  guardrails: {
    selectedAuthority: null;
    taskExecutionAuthorized: false;
    productionMutationAuthorized: false;
  };
};

const ENGINE_UNREPRESENTED_SIGNALS = new Set<ShadowSignal>([
  'negation',
  'condition',
  'dependency',
  'multiple_acts',
]);

function normalizedText(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function signalValue(envelope: SemanticEnvelope, signal: ShadowSignal): boolean | null {
  const acts = envelope.acts;

  // The current engine adapter is a single-frame, explicitly lossy projection.
  // Missing multi-act relations are unknown, not evidence of absence.
  if (envelope.source.system === 'engine-interpreter' && ENGINE_UNREPRESENTED_SIGNALS.has(signal)) {
    return null;
  }

  switch (signal) {
    case 'action':
      return acts.some((act) => !!act.actionVerb && act.kind !== 'question' && act.kind !== 'observation');
    case 'question':
      return acts.some((act) => act.kind === 'question') ||
        /question|interrogative/i.test(envelope.context.speechAct ?? '') ||
        /^(ask|explain|search|question)$/i.test(envelope.context.intent ?? '');
    case 'observation':
      return acts.some((act) => act.kind === 'observation');
    case 'negation':
      return acts.some((act) => act.polarity === 'negated') ||
        envelope.context.evidence.some((item) => /negat|prohibit|must_not/i.test(item));
    case 'correction':
      return envelope.correctionChain.length > 0 ||
        acts.some((act) => act.corrections.length > 0) ||
        envelope.context.isCorrection;
    case 'condition':
      return acts.some((act) => !!act.condition) ||
        envelope.relations.some((relation) => relation.kind === 'condition');
    case 'dependency':
      return acts.some((act) => !!act.dependency) ||
        envelope.relations.some((relation) => relation.kind === 'dependency');
    case 'temporal':
      return envelope.temporalExpressions.length > 0 ||
        acts.some((act) => !!act.temporalRaw || !!act.temporalResolvedDate) ||
        !!envelope.context.dateHint || !!envelope.context.timeHint;
    case 'entity':
      return envelope.entities.length > 0 || acts.some((act) => act.entityLinks.length > 0);
    case 'reference':
      return acts.some((act) => act.references.length > 0) ||
        envelope.relations.some((relation) => relation.kind === 'reference');
    case 'multiple_acts':
      return acts.length > 1;
    case 'blocks_task_creation':
      return envelope.context.mustNotCreateTask || acts.some((act) => act.blocksTaskCreation);
    case 'requires_clarification':
      return envelope.context.requiresConfirmation || acts.some((act) => act.requiresClarification);
  }
}

function observation(envelope: SemanticEnvelope, signal: ShadowSignal): ShadowSignalObservation {
  return {
    signal,
    value: signalValue(envelope, signal),
    producer: envelope.source.system,
    adapterVersion: envelope.provenance.adapterVersion,
    lossyProjection: envelope.provenance.lossyProjection,
  };
}

/**
 * Compare the speech and engine evidence for the same utterance.
 *
 * Signal disagreements are surfaced only where both representations can
 * express the signal. No producer is treated as ground truth.
 */
export function compareSemanticEnvelopes(
  speech: SemanticEnvelope,
  engine: SemanticEnvelope
): SemanticShadowComparison {
  const sameUtterance = normalizedText(speech.source.normalizedText) === normalizedText(engine.source.normalizedText);
  const comparisons: ShadowSignalComparison[] = SHADOW_SIGNALS.map((signal) => {
    const speechObservation = observation(speech, signal);
    const engineObservation = observation(engine, signal);
    const status: ShadowComparisonStatus = !sameUtterance
      ? 'different_input'
      : speechObservation.value === null || engineObservation.value === null
        ? 'not_comparable'
        : speechObservation.value === engineObservation.value
          ? 'agree'
          : 'disagree';
    return { signal, speech: speechObservation, engine: engineObservation, status };
  });
  const count = (status: ShadowComparisonStatus) => comparisons.filter((item) => item.status === status).length;

  return {
    contract: 'dokkit.semantic-shadow-comparison',
    version: 1,
    input: {
      sameUtterance,
      speechText: speech.source.normalizedText,
      engineText: engine.source.normalizedText,
    },
    comparisons,
    summary: {
      comparable: count('agree') + count('disagree'),
      agreements: count('agree'),
      disagreements: count('disagree'),
      notComparable: count('not_comparable'),
      differentInput: count('different_input'),
    },
    guardrails: {
      selectedAuthority: null,
      taskExecutionAuthorized: false,
      productionMutationAuthorized: false,
    },
  };
}
