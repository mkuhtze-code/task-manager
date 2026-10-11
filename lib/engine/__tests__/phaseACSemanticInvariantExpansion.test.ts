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

function executable(result: CaptureDockResult) {
  return result.kind === 'act_create' || result.kind === 'act_update' ? result : null;
}

function speechFor(input: string) {
  return processCaptureSpeech({ text: input, todayIso: TODAY });
}

function semanticFor(input: string) {
  return speechFor(input).pipeline.interpretation?.semantic ?? null;
}

describe('Phase AC — expanded cross-path semantic invariants', () => {
  it('retains correction history and the corrected value rather than flattening it away', () => {
    const input = 'Email Chris on Wednesday, no wait, Thursday.';
    const speech = speechFor(input);
    const semantic = speech.pipeline.interpretation?.semantic;
    const corrections = [
      ...(semantic?.correctionChain ?? []),
      ...(semantic?.acts ?? []).flatMap((act) => act.corrections ?? []),
    ];
    const transcript = textForCaptureField(speech);

    expect(semantic).not.toBeNull();
    expect(corrections.some((step) =>
      step.facet === 'date' &&
      /Wednesday/i.test(step.from) &&
      /Thursday/i.test(step.to)
    )).toBe(true);
    expect(transcript).toMatch(/Chris/i);
    expect(transcript).toMatch(/Thursday/i);
    expect(speech.wouldMutateWithoutConfirm).toBe(false);
  });

  it('preserves conditional/dependency meaning without turning it into execution permission', () => {
    const input = 'Send the revised proposal to Lee after finance signs off.';
    const speech = speechFor(input);
    const semantic = speech.pipeline.interpretation?.semantic;
    const acts = semantic?.acts ?? [];
    const action = acts.find((act) => act.actionVerb?.toLowerCase() === 'send');

    expect(action).toBeDefined();
    expect(action?.dependency?.kind).toBe('after');
    expect(action?.dependency?.raw.toLowerCase()).toContain('finance signs off');
    expect(speech.wouldMutateWithoutConfirm).toBe(false);

    const transcript = textForCaptureField(speech);
    const typed = executable(dock(input, 'text'));
    const spoken = executable(dock(transcript, 'speech_transcript'));
    expect(typed).not.toBeNull();
    expect(spoken).not.toBeNull();
    for (const anchor of ['proposal', 'Lee']) {
      expect(typed!.overrides.text.toLowerCase()).toContain(anchor.toLowerCase());
      expect(spoken!.overrides.text.toLowerCase()).toContain(anchor.toLowerCase());
    }
  });

  it('preserves temporal anchors on a reminder across typed and speech-derived capture', () => {
    const input = 'Remind me to take the birthday cake out of the freezer at 3pm tomorrow.';
    const speech = speechFor(input);
    const semantic = speech.pipeline.interpretation?.semantic;
    const transcript = textForCaptureField(speech);
    const typed = executable(dock(input, 'text'));
    const spoken = executable(dock(transcript, 'speech_transcript'));

    expect(semantic?.acts.some((act) =>
      /3\s*:?\s*00?\s*(?:pm)?|3pm|tomorrow/i.test(act.temporalRaw ?? '')
    )).toBe(true);
    expect(transcript.toLowerCase()).toContain('tomorrow');
    expect(typed).not.toBeNull();
    expect(spoken).not.toBeNull();
    for (const anchor of ['birthday cake', 'freezer']) {
      expect(typed!.overrides.text.toLowerCase()).toContain(anchor);
      expect(spoken!.overrides.text.toLowerCase()).toContain(anchor);
    }
    expect(speech.wouldMutateWithoutConfirm).toBe(false);
  });

  it('does not silently resolve a reference when there is no usable context', () => {
    const input = 'Move it to Friday.';
    const speech = speechFor(input);
    const semantic = semanticFor(input);
    const references = (semantic?.acts ?? []).flatMap((act) => act.references ?? []);

    expect(references.some((reference) =>
      reference.pronoun.toLowerCase() === 'it' &&
      reference.requiresClarification &&
      reference.resolvedTo === null
    )).toBe(true);
    expect(speech.wouldMutateWithoutConfirm).toBe(false);
  });

  it.each([
    ['unfamiliar-domain observation', 'The thingamajig is making a high-pitched noise again.'],
    ['tentative hypothesis', 'Maybe the timeout is caused by the proxy, but we have not confirmed that.'],
    ['information-seeking question', 'Why does the same melody sound different when played in another key?'],
  ])('preserves non-action meaning for %s across both capture paths', (_label, input) => {
    const speech = speechFor(input);
    const transcript = textForCaptureField(speech);

    expect(captureMustNotCreate(speech)).toBe(true);
    expect(speech.wouldMutateWithoutConfirm).toBe(false);
    expect(executable(dock(input, 'text'))).toBeNull();
    expect(executable(dock(transcript, 'speech_transcript'))).toBeNull();
  });
});
