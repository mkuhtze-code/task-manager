import { describe, expect, it } from 'vitest';
import { defaultPersonalCommunicationProfile } from '@/lib/communication/types';
import {
  applyVocabulary,
  emptyModel,
  observeConfirmedInterpretation,
  recordSpeechCorrection,
} from '../learning';
import { interpretSpeech } from '../interpret';

describe('speech learning', () => {
  it('explicit correction updates vocabulary with high weight', () => {
    const model = emptyModel('user-1');
    const profile = defaultPersonalCommunicationProfile('user-1');
    const { model: next, event } = recordSpeechCorrection(model, profile, {
      inputText: 'Call Chook tomorrow',
      originalInterpretation: 'Chook',
      correctedInterpretation: 'Chuck',
      kind: 'transcription_correction',
    });
    expect(event.confidence).toBe('high');
    expect(event.evidenceCount).toBeGreaterThanOrEqual(3);
    expect(next.vocabulary.some((v) => v.preferred === 'Chuck')).toBe(true);
  });

  it('applyVocabulary only after evidence threshold', () => {
    const model = emptyModel('user-1');
    model.vocabulary.push({
      spoken: 'Chook',
      preferred: 'Chuck',
      evidenceCount: 1,
      source: 'observation',
      lastEvidenceAt: new Date().toISOString(),
    });
    const weak = applyVocabulary('Call Chook tomorrow', model);
    expect(weak.applied.length).toBe(0);

    model.vocabulary[0].evidenceCount = 3;
    model.vocabulary[0].source = 'explicit_correction';
    const strong = applyVocabulary('Call Chook tomorrow', model);
    expect(strong.applied.length).toBe(1);
    expect(strong.text).toContain('Chuck');
  });

  it('confirmed interpretation observes certainty language', () => {
    const model = emptyModel('user-1');
    const interpretation = interpretSpeech("I'll probably get that done tomorrow.");
    const next = observeConfirmedInterpretation(model, interpretation);
    expect(next.userId).toBe('user-1');
  });
});
