import { describe, expect, it } from 'vitest';
import { processCaptureSpeech, captureMustNotCreate } from '../captureAdapter';
import { expandSpokenNumbers, stripFillers } from '../normalise';

describe('Phase 14 — general speech/capture safety regressions', () => {
  it.each([
    'Maybe I should email the client tomorrow.',
    "I'm wondering whether I should call the supplier.",
    'Perhaps I should check the measurements next week.',
    'Hmm, maybe chase them when I have time.',
  ])('does not turn speculation into a task: %s', (text) => {
    const result = processCaptureSpeech({ text });
    expect(captureMustNotCreate(result)).toBe(true);
    expect(result.wouldMutateWithoutConfirm).toBe(false);
  });

  it.each([
    'Call the supplier tomorrow.',
    'I need to email the client tomorrow.',
    'Check the measurements next week.',
  ])('still recognises a direct action: %s', (text) => {
    const result = processCaptureSpeech({ text });
    expect(result.outcome).not.toBe('DO_NOT_CREATE');
    expect(result.wouldMutateWithoutConfirm).toBe(false);
  });

  it('preserves meaningful “like” after a subject pronoun', () => {
    expect(stripFillers('I like the current plan').text.toLowerCase()).toContain('like');
  });

  it('normalises spoken clock phrases before generic number expansion', () => {
    expect(expandSpokenNumbers('Meet the installer at three thirty').text).toMatch(/3:30/);
  });
});
