import { describe, expect, it } from 'vitest';
import { fromEngineInterpretation, fromSpeechInterpretation } from '@/lib/semantic-contract/adapters';
import { interpretSemanticInput } from '@/lib/engine/semanticInterpreter';
import { emptyWorkingMemory } from '@/lib/engine/workingMemory';
import type { SpeechInterpretation } from '@/lib/speech/types';

const speechFixture: SpeechInterpretation = {
  id: 'fixture-speech-1',
  originalTranscript: 'Email Alex on Wednesday, no wait, Thursday.',
  normalisedText: 'Email Alex on Wednesday, no wait, Thursday.',
  intent: 'create',
  statementType: 'REQUEST',
  certainty: 'definite',
  commitmentStrength: 'strong',
  urgency: 'none',
  constraints: [],
  temporalReferences: [{
    raw: 'Thursday',
    kind: 'weekday',
    resolvedDate: null,
    resolvedTime: null,
    isCorrection: true,
    confidence: 'high',
  }],
  entities: [{
    raw: 'Alex',
    kind: 'person',
    resolvedId: null,
    confidence: 'high',
    wasCorrected: false,
  }],
  corrections: [],
  ambiguity: 'none',
  surfaceSummary: 'Email Alex on Thursday',
  confidence: 'high',
  reasons: ['correction:date'],
  requiresConfirmation: true,
  semantic: {
    rawText: 'Email Alex on Wednesday, no wait, Thursday.',
    normalisedText: 'Email Alex on Wednesday, no wait, Thursday.',
    acts: [{
      id: 'act-1',
      kind: 'action',
      rawSpan: 'Email Alex on Thursday',
      polarity: 'positive',
      actionVerb: 'email',
      objectText: 'Alex',
      temporalRaw: 'Thursday',
      temporalRelation: 'on',
      corrections: [{ from: 'Wednesday', to: 'Thursday', marker: 'no wait', facet: 'date', order: 1, actId: 'act-1' }],
      evidence: [{ signal: 'explicit_correction', source: 'correction-parser', span: 'no wait' }],
      confidence: 'high',
      blocksTaskCreation: false,
      requiresClarification: false,
      targetsExistingContext: false,
    }],
    correctionChain: [{ from: 'Wednesday', to: 'Thursday', marker: 'no wait', facet: 'date', order: 1, actId: 'act-1' }],
    mustNotCreateTask: false,
    requiresConfirmation: true,
    reasons: ['correction_chain_present'],
    confidence: 'high',
  },
  createdAt: '2026-10-12T00:00:00.000Z',
};

describe('Phase N semantic envelope adapters', () => {
  it('preserves speech act boundaries, polarity, correction links and evidence', () => {
    const envelope = fromSpeechInterpretation(speechFixture);
    expect(envelope.contract).toBe('dokkit.semantic-envelope');
    expect(envelope.version).toBe(1);
    expect(envelope.acts).toHaveLength(1);
    expect(envelope.acts[0].polarity).toBe('positive');
    expect(envelope.acts[0].corrections[0]).toMatchObject({
      from: 'Wednesday',
      to: 'Thursday',
      facet: 'date',
      actId: 'act-1',
    });
    expect(envelope.correctionChain[0].marker).toBe('no wait');
    expect(envelope.entities[0]).toMatchObject({ raw: 'Alex', kind: 'person', resolvedId: null });
    expect(envelope.temporalExpressions[0]).toMatchObject({ raw: 'Thursday', kind: 'weekday', isCorrection: true });
    expect(envelope.acts[0].evidence[0].source).toBe('correction-parser');
    expect(envelope.provenance.lossyProjection).toBe(false);
  });

  it('marks the engine adapter as lossy instead of claiming parity', () => {
    const interpretation = interpretSemanticInput('Call Jordan to ask about the measurements tomorrow.', {
      workingMemory: emptyWorkingMemory('2026-10-12'),
      jobs: [],
      meetings: [],
    });
    const envelope = fromEngineInterpretation(interpretation);
    expect(envelope.source.system).toBe('engine-interpreter');
    expect(envelope.provenance.lossyProjection).toBe(true);
    expect(envelope.provenance.lossNotes.length).toBeGreaterThan(0);
    expect(envelope.acts.length).toBeLessThanOrEqual(1);
    expect(envelope.context.dateHint).toBe(interpretation.dateHint);
  });

  it('keeps interpretation separate from action authority', () => {
    const envelope = fromSpeechInterpretation(speechFixture);
    expect(envelope).not.toHaveProperty('decision');
    expect(envelope).not.toHaveProperty('execute');
    expect(envelope).not.toHaveProperty('actionToRun');
  });
});
