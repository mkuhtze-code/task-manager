import { describe, it, expect } from 'vitest';
import { processCaptureSpeech } from '../captureAdapter';

describe('clear action utterance — not ask for more detail', () => {
  it('check on Monday weather the flashings will work → CREATE_TASK proposal', () => {
    const r = processCaptureSpeech({
      text: 'check on Monday weather the flashings will work',
    });
    expect(r.outcome).toBe('CREATE_TASK');
    expect(r.uiMode).not.toBe('ask_clarification');
    expect(r.mustNotCreateTask).toBe(false);
    expect(r.wouldMutateWithoutConfirm).toBe(false);
    expect(r.normalisedText.toLowerCase()).toContain('flashings');
    expect(r.normalisedText.toLowerCase()).toContain('monday');
  });

  it('check on Monday whether the flashings can be fixed → CREATE_TASK', () => {
    const r = processCaptureSpeech({
      text: 'check on Monday whether the flashings can be fixed',
    });
    expect(r.outcome).toBe('CREATE_TASK');
    expect(r.uiMode).not.toBe('ask_clarification');
  });
});
