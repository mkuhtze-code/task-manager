import { describe, expect, it } from 'vitest';
import {
  processCaptureSpeech,
  captureMustNotCreate,
  confirmCaptureSpeech,
  rejectOrCorrectCaptureSpeech,
} from '../captureAdapter';
import { MUST_NOT_CREATE_TASK } from '../golden/mustNotCreateTask';
import { emptyPersonalLanguageModel } from '../types';
import type { PersonalCommunicationProfile } from '@/lib/communication/types';

function emptyProfile(userId: string): PersonalCommunicationProfile {
  return {
    userId,
    phraseMeanings: [],
    temporalPhrases: [],
    entityAliases: [],
    correctionPatterns: [],
    inferenceTolerance: 'medium',
    confirmationPreference: 'balanced',
    uncertaintyPhrases: [],
    style: { fragmentationRate: 0, shorthandUsage: 0 },
    updatedAt: new Date().toISOString(),
  };
}

describe('captureAdapter — UI seam', () => {
  it('returns stable fields for a clear action', () => {
    const r = processCaptureSpeech({ text: 'Call John tomorrow.' });
    expect(r.rawText).toBeTruthy();
    expect(r.surfaceSummary).toBeTruthy();
    expect(r.confidence.transcription).toBeTruthy();
    expect(r.confidence.interpretation).toBeTruthy();
    expect(r.confidence.action).toBeTruthy();
    expect(Array.isArray(r.proposals)).toBe(true);
    expect(Array.isArray(r.evidenceTrail)).toBe(true);
    if (r.outcome === 'CREATE_TASK') {
      expect(r.uiMode).toBe('confirm_proposals');
      expect(r.wouldMutateWithoutConfirm).toBe(false);
    }
  });

  it('reported speech is safe noop / note', () => {
    const r = processCaptureSpeech({ text: "John said he'd call tomorrow." });
    expect(captureMustNotCreate(r)).toBe(true);
    expect(r.outcome).not.toBe('CREATE_TASK');
  });

  it('thinking aloud does not create', () => {
    const r = processCaptureSpeech({ text: 'Maybe I should call the supplier tomorrow.' });
    expect(captureMustNotCreate(r)).toBe(true);
    expect(r.wouldMutateWithoutConfirm).toBe(false);
  });

  it('negation does not create', () => {
    const r = processCaptureSpeech({ text: "I don't need to call John." });
    expect(captureMustNotCreate(r)).toBe(true);
  });

  it('multi-act yields confirm mode when multiple proposals', () => {
    const r = processCaptureSpeech({
      text: 'Call John tomorrow and email Sarah Friday.',
    });
    if (r.outcome === 'CREATE_MULTIPLE_TASKS' || r.proposals.length >= 2) {
      expect(r.uiMode).toBe('confirm_proposals');
      expect(r.wouldMutateWithoutConfirm).toBe(false);
    }
  });

  it('context focus does not auto-mutate', () => {
    const r = processCaptureSpeech({
      text: 'Move that to Friday',
      understandingContext: {
        jobs: [{ id: 'j1', label: 'Henderson extension', kind: 'job', aliases: ['Henderson'] }],
        focusEntityIds: ['j1'],
      },
    });
    expect(r.wouldMutateWithoutConfirm).toBe(false);
  });
});

describe('captureAdapter — MUST_NOT_CREATE_TASK golden path', () => {
  it('no golden case wouldMutateWithoutConfirm', () => {
    const failures: string[] = [];
    for (const text of MUST_NOT_CREATE_TASK) {
      const r = processCaptureSpeech({ text });
      if (r.wouldMutateWithoutConfirm) failures.push(text);
      if (r.outcome === 'CREATE_TASK' && !r.requiresConfirmation) failures.push(`AUTO:${text}`);
    }
    expect(failures).toEqual([]);
  });
});

describe('captureAdapter — learning hooks', () => {
  it('confirm updates model without throwing', () => {
    const model = emptyPersonalLanguageModel('u1');
    const r = processCaptureSpeech({ text: 'Call Mike tomorrow.', userId: 'u1' });
    const { model: next, event } = confirmCaptureSpeech(model, r);
    expect(next.userId).toBe('u1');
    expect(event.kind).toBe('interpretation_confirmed');
  });

  it('reject records correction', () => {
    const model = emptyPersonalLanguageModel('u1');
    const profile = emptyProfile('u1');
    const r = processCaptureSpeech({ text: 'Call John.' });
    const out = rejectOrCorrectCaptureSpeech(model, profile, {
      result: r,
      correctedSummary: 'Call Mike instead',
    });
    expect(out.event.kind).toMatch(/correct/);
  });
});
