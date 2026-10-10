import { describe, expect, it } from 'vitest';
import type { SemanticEnvelope, SemanticEnvelopeAct } from '@/lib/semantic-contract/envelope';
import { composeSemanticEvidenceShadow } from '@/lib/semantic-contract/shadowComposition';

function envelope(
  system: SemanticEnvelope['source']['system'],
  options: {
    text?: string;
    action?: boolean;
    negated?: boolean;
    correction?: boolean;
    condition?: boolean;
    multipleActs?: boolean;
  } = {}
): SemanticEnvelope {
  const text = options.text ?? 'Email Alex on Thursday.';
  const makeAct = (id: string): SemanticEnvelopeAct => ({
    id,
    kind: 'action',
    rawSpan: text,
    polarity: options.negated ? 'negated' : 'positive',
    actionVerb: options.action === false ? null : 'email',
    objectText: 'Alex',
    subjectText: null,
    sourceSpeaker: null,
    temporalRaw: null,
    temporalRelation: null,
    temporalResolvedDate: null,
    certainty: null,
    commitment: null,
    condition: options.condition ? { raw: 'if it rains', kind: 'if', confidence: 'high' } : null,
    dependency: null,
    references: [],
    entityLinks: [],
    corrections: options.correction ? [{
      from: 'Wednesday', to: 'Thursday', marker: 'no wait', facet: 'date', order: 1,
    }] : [],
    evidence: [],
    confidence: 'high',
    blocksTaskCreation: false,
    requiresClarification: false,
    targetsExistingContext: false,
    provenance: { system, sourceActId: id },
  });
  const acts = [makeAct('act-1')];
  if (options.multipleActs) acts.push(makeAct('act-2'));
  const corrections = options.correction ? [{
    from: 'Wednesday', to: 'Thursday', marker: 'no wait', facet: 'date' as const, order: 1,
  }] : [];
  return {
    contract: 'dokkit.semantic-envelope',
    version: 1,
    source: {
      kind: system === 'speech-pipeline' ? 'speech' : 'engine',
      system,
      rawText: text,
      normalizedText: text,
    },
    acts,
    correctionChain: corrections,
    entities: [],
    temporalExpressions: [],
    relations: options.condition ? [{
      kind: 'condition', sourceActId: 'act-1', target: null, raw: 'if it rains',
      confidence: 'high', provenance: 'fixture',
    }] : [],
    constraints: [],
    context: {
      speechAct: null, intent: null, certainty: null, commitment: null, urgency: null,
      dateHint: null, timeHint: null, relatedJobText: null, relatedMeetingText: null,
      isRefinement: false, isCorrection: !!options.correction, mustNotCreateTask: false,
      requiresConfirmation: false, confidence: 'high', evidence: [],
    },
    provenance: {
      semanticProducer: system, adapterVersion: 1,
      lossyProjection: system === 'engine-interpreter',
      lossNotes: system === 'engine-interpreter' ? ['single-frame projection'] : [],
    },
  };
}

describe('Phase N shadow semantic composition plan', () => {
  it('offers a candidate only when both producers agree on a representable signal', () => {
    const plan = composeSemanticEvidenceShadow(
      envelope('speech-pipeline', { action: true }),
      envelope('engine-interpreter', { action: true })
    );
    expect(plan.contract).toBe('dokkit.semantic-composition-plan');
    expect(plan.signals.find((item) => item.signal === 'action')).toMatchObject({
      speechValue: true,
      engineValue: true,
      disposition: 'converged_candidate',
      candidateValue: true,
      abstentionReason: null,
    });
  });

  it('abstains on disagreement rather than choosing a producer', () => {
    const plan = composeSemanticEvidenceShadow(
      envelope('speech-pipeline', { action: true }),
      envelope('engine-interpreter', { action: false })
    );
    expect(plan.signals.find((item) => item.signal === 'action')).toMatchObject({
      comparison: 'disagree',
      disposition: 'conflict',
      candidateValue: null,
      abstentionReason: 'producer_disagreement',
    });
    expect(plan.guardrails.selectedAuthority).toBeNull();
  });

  it('abstains when a lossy engine projection cannot represent a signal', () => {
    const plan = composeSemanticEvidenceShadow(
      envelope('speech-pipeline', { negated: true }),
      envelope('engine-interpreter', { negated: false })
    );
    expect(plan.signals.find((item) => item.signal === 'negation')).toMatchObject({
      speechValue: true,
      engineValue: null,
      comparison: 'not_comparable',
      disposition: 'abstain_unknown',
      candidateValue: null,
      abstentionReason: 'one_or_more_producers_cannot_represent_signal',
    });
  });

  it('abstains for every signal when inputs differ', () => {
    const plan = composeSemanticEvidenceShadow(
      envelope('speech-pipeline', { text: 'Email Alex on Thursday.' }),
      envelope('engine-interpreter', { text: 'Call Jordan on Friday.' })
    );
    expect(plan.input.sameUtterance).toBe(false);
    expect(plan.signals.every((item) => item.disposition === 'abstain_different_input')).toBe(true);
    expect(plan.summary.differentInputAbstentions).toBe(plan.signals.length);
    expect(plan.signals.every((item) => item.candidateValue === null)).toBe(true);
  });

  it('does not convert shared absence of a feature into execution authority', () => {
    const plan = composeSemanticEvidenceShadow(
      envelope('speech-pipeline', { action: false }),
      envelope('engine-interpreter', { action: false })
    );
    expect(plan.signals.find((item) => item.signal === 'action')).toMatchObject({
      disposition: 'converged_candidate',
      candidateValue: false,
    });
    expect(plan.guardrails).toEqual({
      selectedAuthority: null,
      canonicalEnvelopeProduced: false,
      taskExecutionAuthorized: false,
      productionMutationAuthorized: false,
    });
  });

  it('reports explicit aggregate counts consistent with the per-signal plan', () => {
    const plan = composeSemanticEvidenceShadow(
      envelope('speech-pipeline', { correction: true, condition: true, multipleActs: true }),
      envelope('engine-interpreter', { correction: false, condition: false, multipleActs: false })
    );
    expect(plan.summary.conflicts).toBeGreaterThanOrEqual(0);
    expect(plan.summary.convergedCandidates + plan.summary.conflicts +
      plan.summary.unknownAbstentions + plan.summary.differentInputAbstentions).toBe(plan.signals.length);
  });
});
