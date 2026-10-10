import { describe, expect, it } from 'vitest';
import { textForCaptureField } from '@/hooks/useCaptureSpeech';
import { runCaptureDock, type CaptureDockResult } from '@/lib/engine/captureDock';
import { applyUtteranceToRequest, emptyRequest, requestTaskText } from '@/lib/engine/request';
import { emptyWorkingMemory } from '@/lib/engine/workingMemory';
import { processCaptureSpeech } from '@/lib/speech/captureAdapter';

const TODAY = '2026-10-09';
const jobs = [
  { id: 'job-korohata', name: 'Korohata Terrace', locationText: '12 Korohata Terrace' },
  { id: 'job-angela', name: 'Angela Place', locationText: 'Angela Place' },
  { id: 'job-grace', name: 'Grace James Road', locationText: '64 Grace James Road, Pukekohe' },
  { id: 'job-smith', name: 'Smith Road', locationText: 'Smith Road' },
];

function captureAndDock(input: string, priorRequest: ReturnType<typeof emptyRequest> | null = null) {
  const speech = processCaptureSpeech({ text: input, todayIso: TODAY });
  const line = textForCaptureField(speech);
  const dock = runCaptureDock({
    line,
    userId: null,
    priorRequest,
    jobs,
    captureJobId: null,
    captureSurfaceDate: TODAY,
    remainingMinsToday: 240,
    openTaskCount: 0,
    inputType: 'speech_transcript',
  });
  return { speech, line, dock };
}

function expectDockable(result: CaptureDockResult, input: string) {
  expect(
    result.kind === 'act_create' || result.kind === 'act_update',
    `Expected an executable Dock action for "${input}", got ${result.kind}: ${result.message}`,
  ).toBe(true);
  if (result.kind !== 'act_create' && result.kind !== 'act_update') {
    throw new Error(`Not dockable: ${result.kind} — ${result.message}`);
  }
  return result;
}

describe('Phase 20 — production acceptance: Capture → speech → Dock', () => {
  it('keeps a new quote isolated from the previous materials pickup request', () => {
    const priorRequest = applyUtteranceToRequest(
      emptyRequest(),
      'I need to go to Bunnings to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS',
      emptyWorkingMemory(),
    );
    expect(requestTaskText(priorRequest).toLowerCase()).toContain('sika');

    const input = 'Quote for Korohata Terrace';
    const { dock } = captureAndDock(input, priorRequest);
    const action = expectDockable(dock, input);
    expect(action.kind).toBe('act_create');
    expect(action.overrides.text.toLowerCase()).toContain('quote');
    expect(action.overrides.text.toLowerCase()).toContain('korohata');
    expect(action.overrides.text.toLowerCase()).not.toContain('sika');
    expect(action.overrides.locationText?.toLowerCase()).toContain('korohata');
  });

  it('keeps the primary call action when the purpose contains a second verb', () => {
    const input = 'I need to call Jordan to get the measurements for the downpipes for Angela Place';
    const { dock } = captureAndDock(input);
    const action = expectDockable(dock, input);
    expect(action.overrides.text.toLowerCase()).toContain('call');
    expect(action.overrides.text.toLowerCase()).toContain('jordan');
    expect(action.overrides.text.toLowerCase()).toContain('measurement');
    expect(action.overrides.locationText?.toLowerCase()).toContain('angela');
  });

  it('captures a multi-item trade pickup as one task at the supplier', () => {
    const input = 'I need to go to Bunnings to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS';
    const { dock } = captureAndDock(input);
    const action = expectDockable(dock, input);
    expect(action.overrides.text.toLowerCase()).toContain('sika');
    expect(action.overrides.text.toLowerCase()).toContain('cartridge');
    expect(action.overrides.text.toLowerCase()).toContain('sausage');
    expect(action.overrides.locationText?.toLowerCase()).toContain('bunnings');
  });

  it('makes a concrete timed drop-off executable without a clarification gate', () => {
    const input = 'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today';
    const { dock } = captureAndDock(input);
    const action = expectDockable(dock, input);
    expect(action.overrides.text.toLowerCase()).toContain('clip');
    expect(action.overrides.locationText?.toLowerCase()).toContain('grace james');
    expect(action.overrides.surfaceDate).toBe(TODAY);
  });

  it('resolves an explicit weekday to a concrete date for task placement', () => {
    const input = 'I need to call Jordan about the Smith Street flashing on Monday';
    const { dock } = captureAndDock(input);
    const action = expectDockable(dock, input);
    expect(action.overrides.surfaceDate).toBe('2026-10-12');
  });

  it('keeps a hesitant call request out of list/collection intent', () => {
    const input = 'I need to, um, call Jordan and get the measurements for Angela Place';
    const { speech, dock } = captureAndDock(input);
    expect(speech.collection?.intent.type ?? null).toBeNull();
    const action = expectDockable(dock, input);
    expect(action.overrides.text.toLowerCase()).toContain('call');
    expect(action.overrides.text.toLowerCase()).toContain('jordan');
  });

  it('treats “take materials to Smith Road” as delivery work, not list removal', () => {
    const input = 'Take the materials to Smith Road on Monday';
    const { speech, dock } = captureAndDock(input);
    expect(speech.collection?.intent.type ?? null).toBeNull();
    const action = expectDockable(dock, input);
    expect(action.overrides.text.toLowerCase()).toContain('material');
    expect(action.overrides.locationText?.toLowerCase()).toContain('smith');
  });

  it('preserves a site-work action and location from a short spoken request', () => {
    const input = 'Check the flashings for Smith Street';
    const { dock } = captureAndDock(input);
    const action = expectDockable(dock, input);
    expect(action.overrides.text.toLowerCase()).toContain('check');
    expect(action.overrides.text.toLowerCase()).toContain('flashing');
    expect(action.overrides.locationText?.toLowerCase()).toContain('smith');
  });

  it('does not let a complete address-and-time drop-off get blocked by planning feedback', () => {
    const input = 'Drop off clips at 64 Grace James Road at 12pm today';
    const { dock } = captureAndDock(input);
    const action = expectDockable(dock, input);
    expect(action.overrides.locationText?.toLowerCase()).toContain('grace james');
    expect(action.overrides.text.toLowerCase()).toContain('clip');
  });
});
