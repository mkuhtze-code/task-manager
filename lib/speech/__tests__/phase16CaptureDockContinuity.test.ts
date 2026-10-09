import { describe, expect, it } from 'vitest';
import { processCaptureSpeech } from '../captureAdapter';
import { textForCaptureField } from '@/hooks/useCaptureSpeech';
import { runCaptureDock } from '@/lib/engine/captureDock';

function dockSpoken(text: string) {
  const speech = processCaptureSpeech({ text });
  const line = textForCaptureField(speech);
  const dock = runCaptureDock({
    line,
    userId: null,
    priorRequest: null,
    jobs: [],
    captureJobId: null,
    captureSurfaceDate: '2026-10-09',
    remainingMinsToday: 240,
    openTaskCount: 0,
    inputType: 'speech_transcript',
  });
  return { speech, line, dock };
}

describe('Phase 16 — speech-to-Dock continuity', () => {
  it('keeps the complete communication request instead of replacing it with a lossy proposal summary', () => {
    const raw =
      'I need to call Jordan to get the measurements for the downpipes for Angela Place';
    const { line, dock } = dockSpoken(raw);

    expect(line.toLowerCase()).toContain('call jordan');
    expect(line.toLowerCase()).toContain('measurements');
    expect(line.toLowerCase()).toContain('angela place');
    expect(dock.kind).toBe('act_create');
    if (dock.kind === 'act_create') {
      expect(dock.overrides.text.toLowerCase()).toContain('call jordan');
      expect(dock.overrides.locationText?.toLowerCase()).toContain('angela place');
    }
  });

  it('keeps item, address, and explicit schedule details available to the dock engine', () => {
    const raw =
      'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today';
    const { line, dock } = dockSpoken(raw);

    expect(line.toLowerCase()).toContain('clips');
    expect(line.toLowerCase()).toContain('64 grace james road');
    expect(line.toLowerCase()).toContain('4pm');
    expect(line.toLowerCase()).toContain('today');
    expect(dock.kind).toBe('act_create');
    if (dock.kind === 'act_create') {
      expect(dock.overrides.text.toLowerCase()).toContain('clips');
      expect(dock.overrides.locationText?.toLowerCase()).toContain('64 grace james road');
      expect(dock.overrides.surfaceDate).toBe('2026-10-09');
    }
  });

  it('still routes list mutations through the collection-specific capture text', () => {
    const result = processCaptureSpeech({
      text: 'Start a grocery list: milk, bread, eggs',
    });
    const line = textForCaptureField(result);

    expect(result.collection).toBeTruthy();
    expect(line.toLowerCase()).toContain('milk');
    expect(line.toLowerCase()).toContain('bread');
    expect(line.toLowerCase()).toContain('eggs');
  });
});
