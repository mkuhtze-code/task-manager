import { describe, expect, it } from 'vitest';
import { textForCaptureField } from '@/hooks/useCaptureSpeech';
import { runCaptureDock, type CaptureDockResult } from '@/lib/engine/captureDock';
import { processCaptureSpeech, captureMustNotCreate } from '@/lib/speech/captureAdapter';

const TODAY = '2026-10-12';

function dock(line: string, inputType: 'text' | 'speech_transcript'): CaptureDockResult {
  return runCaptureDock({
    line,
    userId: null,
    priorRequest: null,
    jobs: [],
    captureJobId: null,
    captureSurfaceDate: TODAY,
    remainingMinsToday: 240,
    openTaskCount: 0,
    inputType,
  });
}

function isExecutable(result: CaptureDockResult): boolean {
  return result.kind === 'act_create' || result.kind === 'act_update';
}

function executable(result: CaptureDockResult) {
  if (result.kind !== 'act_create' && result.kind !== 'act_update') return null;
  return result;
}

describe('Phase AB — cross-path semantic safety invariants', () => {
  it.each([
    ['speculative intention', 'Maybe I should email the client tomorrow.'],
    ['completed event plus prohibited duplicate', 'I bought milk already, so do not add it to the shopping list.'],
    ['information question', 'What are the main differences between a compiler and an interpreter?'],
    ['report without follow-up', 'The electricity bill was paid this morning; nothing else is needed.'],
  ])('does not turn %s into executable work on either path', (_label, input) => {
    const speech = processCaptureSpeech({ text: input, todayIso: TODAY });
    const captureLine = textForCaptureField(speech);

    expect(captureMustNotCreate(speech)).toBe(true);
    expect(speech.wouldMutateWithoutConfirm).toBe(false);
    expect(isExecutable(dock(input, 'text'))).toBe(false);
    expect(isExecutable(dock(captureLine, 'speech_transcript'))).toBe(false);
  });

  it.each([
    ['Call the supplier tomorrow.', ['call', 'supplier']],
    ['Check the measurements next week.', ['check', 'measurements']],
    ['Pick up the rental car from the airport at 8 tomorrow.', ['rental car', 'airport']],
  ])('preserves a clear action through typed and speech-derived capture: %s', (input, anchors) => {
    const speech = processCaptureSpeech({ text: input, todayIso: TODAY });
    const captureLine = textForCaptureField(speech);
    const typed = executable(dock(input, 'text'));
    const spoken = executable(dock(captureLine, 'speech_transcript'));

    expect(typed, `typed path did not produce an action for: ${input}`).not.toBeNull();
    expect(spoken, `speech-derived path did not produce an action for: ${input}`).not.toBeNull();
    expect(typed!.kind).toBe(spoken!.kind);

    for (const anchor of anchors) {
      expect(typed!.overrides.text.toLocaleLowerCase()).toContain(anchor);
      expect(spoken!.overrides.text.toLocaleLowerCase()).toContain(anchor);
    }

    // This pass validates interpretation and capture parity, not permission to
    // write. A clear action must still stop at the existing authorization seam.
    expect(speech.wouldMutateWithoutConfirm).toBe(false);
  });
});
