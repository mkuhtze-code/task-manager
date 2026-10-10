import { describe, expect, it } from 'vitest';
import { compareSemanticEnvelopes } from '@/lib/semantic-contract/shadowComparison';
import type { SemanticEnvelope, SemanticEnvelopeAct } from '@/lib/semantic-contract/envelope';

function makeEnvelope(
  system: SemanticEnvelope['source']['system'],
  options: {
    text?: string;
    acts?: Partial<SemanticEnvelopeAct>[];
    entities?: SemanticEnvelope['entities'];
    temporalExpressions?: SemanticEnvelope['temporalExpressions'];
    correctionChain?: SemanticEnvelope['correctionChain'];
    mustNotCreateTask?: boolean;
    requiresConfirmation?: boolean;
    isCorrection?: boolean;
    intent?: string | null;
    speechAct?: string | null;
    lossyProjection?: boolean;
  } = {}
): SemanticEnvelope {
  const text = options.text ?? 'Email Alex on Thursday.';
  const acts: SemanticEnvelopeAct[] = (options.acts ?? []).map((act, index) => ({
    id: act.id ?? `act-${index + 1}`,
    kind: act.kind ?? 'action',
    rawSpan: act.rawSpan ?? text,
    polarity: act.polarity ?? 'positive',
    actionVerb: act.actionVerb === undefined ? 'email' : act.actionVerb,
    objectText: act.objectText === undefined ? 'Alex' : act.objectText,
    subjectText: act.subjectText ?? null,
    sourceSpeaker: act.sourceSpeaker ?? null,
    temporalRaw: act.temporalRaw ?? null,
    temporalRelation: act.temporalRelation ?? null,
    temporalResolvedDate: act.temporalResolvedDate ?? null,
    certainty: act.certainty ?? null,
    commitment: act.commitment ?? null,
    condition: act.condition ?? null,
    dependency: act.dependency ?? null,
    references: act.references ?? [],
    entityLinks: act.entityLinks ?? [],
    corrections: act.corrections ?? [],
    evidence: act.evidence ?? [],
    confidence: act.confidence ?? 'high',
    blocksTaskCreation: act.blocksTaskCreation ?? false,
    requiresClarification: act.requiresClarification ?? false,
    targetsExistingContext: act.targetsExistingContext ?? false,
    provenance: act.provenance ?? { system, sourceActId: act.id ?? `act-${index + 1}` },
  }));
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
    correctionChain: options.correctionChain ?? [],
    entities: options.entities ?? [],
    temporalExpressions: options.temporalExpressions ?? [],
    relations: [],
    constraints: [],
    context: {
      speechAct: options.speechAct ?? null,
      intent: options.intent ?? null,
      certainty: null,
      commitment: null,
      urgency: null,
      dateHint: null,
      timeHint: null,
      relatedJobText: null,
      relatedMeetingText: null,
      isRefinement: false,
      isCorrection: options.isCorrection ?? false,
      mustNotCreateTask: options.mustNotCreateTask ?? false,
      requiresConfirmation: options.requiresConfirmation ?? false,
      confidence: 'high',
      evidence: [],
    },
    provenance: {
      semanticProducer: system,
      adapterVersion: 1,
      lossyProjection: options.lossyProjection ?? system === 'engine-interpreter',
      lossNotes: system === 'engine-interpreter' ? ['single-frame projection'] : [],
    },
  };
}

describe('Phase N shadow semantic comparison', () => {
  it('surfaces representable disagreement without selecting a producer', () => {
    const speech = makeEnvelope('speech-pipeline', {
      acts: [{ kind: 'action', actionVerb: 'email', corrections: [{
        from: 'Wednesday', to: 'Thursday', marker: 'no wait', facet: 'date', order: 1,
      }] }],
      correctionChain: [{ from: 'Wednesday', to: 'Thursday', marker: 'no wait', facet: 'date', order: 1 }],
      temporalExpressions: [{
        raw: 'Thursday', kind: 'weekday', resolvedDate: null, resolvedTime: null,
        isCorrection: true, confidence: 'high', provenance: 'speech',
      }],
    });
    const engine = makeEnvelope('engine-interpreter', {
      acts: [{ kind: 'action', actionVerb: 'email' }],
      isCorrection: false,
    });

    const report = compareSemanticEnvelopes(speech, engine);
    const correction = report.comparisons.find((item) => item.signal === 'correction');
    expect(correction?.status).toBe('disagree');
    expect(report.summary.disagreements).toBeGreaterThan(0);
    expect(report.guardrails).toEqual({
      selectedAuthority: null,
      taskExecutionAuthorized: false,
      productionMutationAuthorized: false,
    });
  });

  it('treats unrepresentable engine signals as unknown, not false', () => {
    const speech = makeEnvelope('speech-pipeline', {
      acts: [{ kind: 'action', polarity: 'negated', actionVerb: 'add' }],
    });
    const engine = makeEnvelope('engine-interpreter', {
      acts: [{ kind: 'action', actionVerb: 'add' }],
    });

    const report = compareSemanticEnvelopes(speech, engine);
    expect(report.comparisons.find((item) => item.signal === 'negation')).toMatchObject({
      speech: { value: true },
      engine: { value: null },
      status: 'not_comparable',
    });
    expect(report.summary.notComparable).toBeGreaterThan(0);
  });

  it('refuses to compare different utterances as semantic agreement', () => {
    const speech = makeEnvelope('speech-pipeline', { text: 'Email Alex on Thursday.' });
    const engine = makeEnvelope('engine-interpreter', { text: 'Call Jordan on Friday.' });

    const report = compareSemanticEnvelopes(speech, engine);
    expect(report.input.sameUtterance).toBe(false);
    expect(report.comparisons.every((item) => item.status === 'different_input')).toBe(true);
    expect(report.summary.comparable).toBe(0);
    expect(report.summary.differentInput).toBe(report.comparisons.length);
  });

  it('normalizes harmless whitespace and case before matching inputs', () => {
    const speech = makeEnvelope('speech-pipeline', { text: '  EMAIL   Alex on Thursday. ' });
    const engine = makeEnvelope('engine-interpreter', { text: 'email Alex on Thursday.' });

    expect(compareSemanticEnvelopes(speech, engine).input.sameUtterance).toBe(true);
  });

  it('emits one explicit comparison for each declared signal', () => {
    const speech = makeEnvelope('speech-pipeline');
    const engine = makeEnvelope('engine-interpreter');
    const report = compareSemanticEnvelopes(speech, engine);

    expect(report.contract).toBe('dokkit.semantic-shadow-comparison');
    expect(report.comparisons).toHaveLength(13);
    expect(report.summary.agreements + report.summary.disagreements +
      report.summary.notComparable + report.summary.differentInput).toBe(13);
  });
});
