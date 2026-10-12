import { describe, expect, it } from 'vitest';
import type { SpeechInterpretation } from '@/lib/speech/types';
import { canonicalMeaningFromSpeech } from '../canonicalFromSpeech';

const interpretation = {
  id: 'speech-1',
  originalTranscript: 'Call Jordan tomorrow',
  normalisedText: 'Call Jordan tomorrow',
  intent: 'create',
  statementType: 'request',
  certainty: 'definite',
  commitmentStrength: 'strong',
  urgency: 'none',
  constraints: [],
  temporalReferences: [],
  entities: [],
  corrections: [],
  ambiguity: 'none',
  surfaceSummary: 'Call Jordan tomorrow',
  confidence: 'high',
  reasons: ['positive action'],
  requiresConfirmation: false,
  mustNotCreateTask: false,
  transcriptionConfidence: 'high',
  interpretationConfidence: 'high',
  actionConfidence: 'medium',
  semantic: {
    rawText: 'Call Jordan tomorrow',
    normalisedText: 'Call Jordan tomorrow',
    acts: [{
      id: 'act-1',
      kind: 'action',
      rawSpan: 'Call Jordan tomorrow',
      polarity: 'positive',
      actionVerb: 'call',
      objectText: 'Jordan',
      temporalRaw: 'tomorrow',
      temporalRelation: 'on',
      temporalResolvedDate: null,
      evidence: [],
      confidence: 'high',
      blocksTaskCreation: false,
      entityLinks: [],
    }],
    correctionChain: [],
    mustNotCreateTask: false,
    requiresConfirmation: false,
    reasons: [],
    confidence: 'high',
  },
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as SpeechInterpretation;

describe('canonical speech adapter', () => {
  it('preserves source text and maps semantic acts without re-interpreting text', () => {
    const canonical = canonicalMeaningFromSpeech(interpretation);
    expect(canonical.version).toBe(1);
    expect(canonical.rawText).toBe('Call Jordan tomorrow');
    expect(canonical.acts).toHaveLength(1);
    expect(canonical.acts[0]).toMatchObject({
      id: 'act-1',
      kind: 'create',
      actionVerb: 'call',
      object: 'Jordan',
      time: 'tomorrow',
      polarity: 'positive',
    });
    expect(canonical.constraints).toContainEqual(expect.objectContaining({
      axis: 'temporal',
      value: 'tomorrow',
    }));
  });

  it('preserves negative polarity and task-creation safety', () => {
    const blocked = {
      ...interpretation,
      mustNotCreateTask: true,
      semantic: {
        ...interpretation.semantic,
        mustNotCreateTask: true,
        acts: [{ ...interpretation.semantic.acts[0], polarity: 'negated' }],
      },
    } as unknown as SpeechInterpretation;
    const canonical = canonicalMeaningFromSpeech(blocked);
    expect(canonical.safety.mustNotCreateTask).toBe(true);
    expect(canonical.acts[0].polarity).toBe('negative');
  });
});
