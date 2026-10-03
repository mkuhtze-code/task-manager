import { describe, it, expect } from 'vitest';
import {
  mergeSpeechFinal,
  applySpeechRecognitionEvent,
  assembleProgressiveFinals,
} from '../speechCaptureAssembly';

describe('speech_capture_incremental_hypothesis_replacement', () => {
  it('does not concatenate progressive finals for the flashings utterance', () => {
    const stream = [
      'check',
      'check on',
      'check on Monday',
      'check on Monday whether',
      'check on Monday whether the',
      'check on Monday whether the flashings',
      'check on Monday whether the flashings can be fixed',
    ];
    const final = assembleProgressiveFinals(stream);
    expect(final).toBe('check on Monday whether the flashings can be fixed');
    expect(final).not.toMatch(/check check/);
    expect(final.toLowerCase()).not.toContain('check check on');
  });

  it('replaces when next extends committed', () => {
    expect(mergeSpeechFinal('check', 'check on Monday')).toBe('check on Monday');
  });

  it('keeps committed when next is a shorter prefix', () => {
    expect(mergeSpeechFinal('check on Monday', 'check')).toBe('check on Monday');
  });

  it('space-joins true additive continuous segments', () => {
    expect(mergeSpeechFinal('check on Monday', 'whether the flashings can be fixed')).toBe(
      'check on Monday whether the flashings can be fixed'
    );
  });

  it('preserves legitimate repeated words', () => {
    const final = assembleProgressiveFinals([
      'I need to call John',
      'I need to call John, John said he would be available',
    ]);
    expect(final.toLowerCase()).toContain('john');
    // Progressive extension keeps a single coherent string; the repeated John
    // in the *final* hypothesis is preserved when STT includes it once as final.
    expect(final).toBe('I need to call John, John said he would be available');
  });

  it('joins non-overlapping segments that legitimately repeat a name', () => {
    // Additive segments (not progressive full-string hypotheses)
    expect(mergeSpeechFinal('call John', 'John said he would be available')).toBe(
      'call John John said he would be available'
    );
  });

  it('ignores interim results; only commits isFinal', () => {
    let committed = '';
    committed = applySpeechRecognitionEvent(committed, {
      resultIndex: 0,
      results: [
        { isFinal: false, 0: { transcript: 'check' } },
        { isFinal: false, 0: { transcript: 'check on' } },
      ],
    });
    expect(committed).toBe('');

    committed = applySpeechRecognitionEvent(committed, {
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: 'check on Monday whether the flashings can be fixed' } }],
    });
    expect(committed).toBe('check on Monday whether the flashings can be fixed');
  });

  it('handles continuous segments via resultIndex without replaying earlier finals', () => {
    let committed = '';
    committed = applySpeechRecognitionEvent(committed, {
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: 'check on Monday' } }],
    });
    // Later event: only new index is final; earlier slot still present in results array
    committed = applySpeechRecognitionEvent(committed, {
      resultIndex: 1,
      results: [
        { isFinal: true, 0: { transcript: 'check on Monday' } },
        { isFinal: true, 0: { transcript: 'whether the flashings can be fixed' } },
      ],
    });
    expect(committed).toBe('check on Monday whether the flashings can be fixed');
  });

  it('does not invent weather→whether; preserves STT token', () => {
    const final = assembleProgressiveFinals([
      'check on Monday weather the flashings can be fixed',
    ]);
    expect(final).toContain('weather');
    expect(final).not.toContain('whether');
  });

  it('drops exact duplicate final emissions', () => {
    expect(
      assembleProgressiveFinals([
        'check on Monday',
        'check on Monday',
      ])
    ).toBe('check on Monday');
  });
});
