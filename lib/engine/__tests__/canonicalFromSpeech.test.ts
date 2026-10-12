import { describe, expect, it } from 'vitest';
import type { SpeechInterpretation } from '@/lib/speech/types';
import { canonicalMeaningFromSpeech } from '../canonicalFromSpeech';
import { canonicalMeaningBlocksMutation, isCanonicalUtteranceMeaning } from '../canonicalMeaning';
import { runEngineCycle } from '../orchestrate';
import { emptyRequest } from '../request';
import { emptyWorkingMemory } from '../workingMemory';

function speech(overrides: Partial<SpeechInterpretation> = {}): SpeechInterpretation {
  return {
    id: 'speech-1',
    originalTranscript: 'Call Jordan tomorrow',
    normalisedText: 'Call Jordan tomorrow',
    intent: 'create',
    statementType: 'REQUEST',
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
    reasons: [],
    requiresConfirmation: false,
    mustNotCreateTask: false,
    actionConfidence: 'high',
    interpretationConfidence: 'high',
    createdAt: '2026-10-13T00:00:00.000Z',
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
        entityLinks: [],
        evidence: [],
        confidence: 'high',
        blocksTaskCreation: false,
        targetsExistingContext: false,
      }],
      correctionChain: [],
      mustNotCreateTask: false,
      requiresConfirmation: false,
      reasons: [],
      confidence: 'high',
    },
    ...overrides,
  } as SpeechInterpretation;
}

describe('canonical speech meaning adapter', () => {
  it('preserves the current capture line and structured action roles', () => {
    const meaning = canonicalMeaningFromSpeech(speech(), 'Call Jordan tomorrow');
    expect(isCanonicalUtteranceMeaning(meaning)).toBe(true);
    expect(meaning.rawText).toBe('Call Jordan tomorrow');
    expect(meaning.acts[0]).toMatchObject({
      kind: 'create',
      actionVerb: 'call',
      object: 'Jordan',
      time: 'tomorrow',
      polarity: 'positive',
      targetsExistingContext: false,
    });
  });

  it('carries negative intent into a mutation veto', () => {
    const meaning = canonicalMeaningFromSpeech(speech({
      mustNotCreateTask: true,
      semantic: {
        rawText: 'Do not call Jordan',
        normalisedText: 'Do not call Jordan',
        acts: [{
          id: 'act-negative',
          kind: 'action',
          rawSpan: 'Do not call Jordan',
          polarity: 'negated',
          actionVerb: 'call',
          objectText: 'Jordan',
          evidence: [],
          confidence: 'high',
          blocksTaskCreation: true,
        }],
        correctionChain: [],
        mustNotCreateTask: true,
        requiresConfirmation: false,
        reasons: ['negation'],
        confidence: 'high',
      },
    }), 'Do not call Jordan');
    expect(meaning.safety.mustNotCreateTask).toBe(true);
    expect(canonicalMeaningBlocksMutation(meaning)).toBe(true);
  });


  it('starts a distinct canonical action without inheriting an unrelated prior task', () => {
    const utterance = 'Call Jordan tomorrow';
    const meaning = canonicalMeaningFromSpeech(speech(), utterance);
    const prior = {
      ...emptyRequest('create_task'),
      objectText: 'Gerald',
      titleText: 'Call Gerald',
      primaryVerb: 'call',
      personText: 'Gerald',
      rawUtterances: ['Call Gerald'],
      confidence: 'high' as const,
    };
    const cycle = runEngineCycle({
      utterance,
      priorRequest: prior,
      canonicalMeaning: meaning,
      workingMemory: emptyWorkingMemory(),
      todayDate: '2026-10-13',
    });
    expect(cycle.request.objectText).not.toBe('Gerald');
    expect(cycle.request.rawUtterances).not.toContain('Call Gerald');
  });

  it('ignores stale meaning after the capture line changes', () => {
    const meaning = canonicalMeaningFromSpeech(speech(), 'Call Jordan tomorrow');
    const prior = { ...emptyRequest('create_task'), objectText: 'Gerald', titleText: 'Call Gerald', rawUtterances: ['Call Gerald'], confidence: 'high' as const };
    const cycle = runEngineCycle({ utterance: 'Move it to tomorrow', priorRequest: prior, canonicalMeaning: meaning, workingMemory: emptyWorkingMemory(), todayDate: '2026-10-13' });
    expect(cycle.request.objectText).toBe('Gerald');
    expect(cycle.request.titleText).toBe('Call Gerald');
  });
});
