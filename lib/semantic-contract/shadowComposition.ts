import type { SemanticEnvelope } from './envelope';
import { compareSemanticEnvelopes, SHADOW_SIGNALS, type ShadowSignal, type ShadowComparisonStatus } from './shadowComparison';

/**
 * Phase N shadow-only composition proposal.
 *
 * This does not build an executable semantic envelope. It produces a per-signal
 * plan that can be reviewed against labelled replays before any authority or
 * runtime integration is considered.
 */
export type CompositionDisposition =
  | 'converged_candidate'
  | 'conflict'
  | 'abstain_unknown'
  | 'abstain_different_input';

export type CompositionAbstentionReason =
  | 'producer_disagreement'
  | 'one_or_more_producers_cannot_represent_signal'
  | 'utterance_mismatch';

export type SemanticCompositionSignal = {
  signal: ShadowSignal;
  speechValue: boolean | null;
  engineValue: boolean | null;
  comparison: ShadowComparisonStatus;
  disposition: CompositionDisposition;
  /** Candidate only; never an execution instruction or claim of truth. */
  candidateValue: boolean | null;
  abstentionReason: CompositionAbstentionReason | null;
};

export type SemanticCompositionPlan = {
  contract: 'dokkit.semantic-composition-plan';
  version: 1;
  input: {
    sameUtterance: boolean;
    speechText: string;
    engineText: string;
  };
  signals: SemanticCompositionSignal[];
  summary: {
    convergedCandidates: number;
    conflicts: number;
    unknownAbstentions: number;
    differentInputAbstentions: number;
  };
  guardrails: {
    selectedAuthority: null;
    canonicalEnvelopeProduced: false;
    taskExecutionAuthorized: false;
    productionMutationAuthorized: false;
  };
};

export function composeSemanticEvidenceShadow(
  speech: SemanticEnvelope,
  engine: SemanticEnvelope
): SemanticCompositionPlan {
  const comparison = compareSemanticEnvelopes(speech, engine);
  const signals = SHADOW_SIGNALS.map((signal): SemanticCompositionSignal => {
    const compared = comparison.comparisons.find((item) => item.signal === signal)!;
    if (!comparison.input.sameUtterance) {
      return {
        signal,
        speechValue: compared.speech.value,
        engineValue: compared.engine.value,
        comparison: compared.status,
        disposition: 'abstain_different_input',
        candidateValue: null,
        abstentionReason: 'utterance_mismatch',
      };
    }

    if (compared.speech.value === null || compared.engine.value === null) {
      return {
        signal,
        speechValue: compared.speech.value,
        engineValue: compared.engine.value,
        comparison: compared.status,
        disposition: 'abstain_unknown',
        candidateValue: null,
        abstentionReason: 'one_or_more_producers_cannot_represent_signal',
      };
    }

    if (compared.speech.value !== compared.engine.value) {
      return {
        signal,
        speechValue: compared.speech.value,
        engineValue: compared.engine.value,
        comparison: compared.status,
        disposition: 'conflict',
        candidateValue: null,
        abstentionReason: 'producer_disagreement',
      };
    }

    return {
      signal,
      speechValue: compared.speech.value,
      engineValue: compared.engine.value,
      comparison: compared.status,
      disposition: 'converged_candidate',
      candidateValue: compared.speech.value,
      abstentionReason: null,
    };
  });

  return {
    contract: 'dokkit.semantic-composition-plan',
    version: 1,
    input: { ...comparison.input },
    signals,
    summary: {
      convergedCandidates: signals.filter((item) => item.disposition === 'converged_candidate').length,
      conflicts: signals.filter((item) => item.disposition === 'conflict').length,
      unknownAbstentions: signals.filter((item) => item.disposition === 'abstain_unknown').length,
      differentInputAbstentions: signals.filter((item) => item.disposition === 'abstain_different_input').length,
    },
    guardrails: {
      selectedAuthority: null,
      canonicalEnvelopeProduced: false,
      taskExecutionAuthorized: false,
      productionMutationAuthorized: false,
    },
  };
}
