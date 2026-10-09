import { describe, expect, it } from 'vitest';
import { processCaptureSpeech } from '@/lib/speech/captureAdapter';
import { textForCaptureField } from '@/hooks/useCaptureSpeech';
import { runCaptureDock, type CaptureDockResult } from '@/lib/engine/captureDock';

/**
 * Phase 18: broad end-to-end Capture -> speech interpretation -> Dock torture suite.
 *
 * These are deliberately varied natural-language requests, not phrase-specific
 * parser tests. Every case traverses the same two seams used by the UI:
 * processCaptureSpeech() and runCaptureDock().
 */
type Case = {
  category: string;
  input: string;
  expectedText?: string[];
  expectedLocation?: string;
};

const cases: Case[] = [
  // Communication is the primary action; nested purpose verbs must not replace it.
  { category: 'communication', input: 'I need to call Jordan to get the measurements for the downpipes for Angela Place', expectedText: ['call jordan', 'measurements'], expectedLocation: 'Angela Place' },
  { category: 'communication', input: 'Ring Mike about the gutter measurements at Smith Road', expectedText: ['ring mike', 'gutter'], expectedLocation: 'Smith Road' },
  { category: 'communication', input: 'Email Sarah to confirm the flashing details for 12 Queen Street', expectedText: ['email sarah', 'flashing'], expectedLocation: '12 Queen Street' },
  { category: 'communication', input: 'Text Dave to ask whether the quote is ready for Henderson Road', expectedText: ['text dave', 'quote'], expectedLocation: 'Henderson Road' },
  { category: 'communication', input: 'Message the supplier to check when the materials will arrive at 8 King Street', expectedText: ['message', 'materials'], expectedLocation: '8 King Street' },
  { category: 'communication', input: 'Phone Jordan to find out whether the downpipes fit at Angela Place', expectedText: ['phone jordan', 'downpipes'], expectedLocation: 'Angela Place' },
  { category: 'communication', input: 'Contact Sarah about the revised quote for 20 Queen Road', expectedText: ['contact sarah', 'quote'], expectedLocation: '20 Queen Road' },
  { category: 'communication', input: 'Call the client to ask about the leak at 8 King Street', expectedText: ['call', 'client', 'leak'], expectedLocation: '8 King Street' },

  // Travel and collection: preserve the thing, action and destination separately.
  { category: 'pickup', input: 'I need to go to Bunnings to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS', expectedText: ['2 cartridges of clear sika ms', '2 sausages of sika white ms'], expectedLocation: 'Bunnings' },
  { category: 'pickup', input: 'Pick up four tubes of white MS from Mitre 10', expectedText: ['four tubes', 'white ms'], expectedLocation: 'Mitre 10' },
  { category: 'pickup', input: 'Grab the screws from Bunnings for Angela Place', expectedText: ['screws'], expectedLocation: 'Bunnings' },
  { category: 'pickup', input: 'Collect the signed plans from the office', expectedText: ['signed plans'], expectedLocation: 'the office' },
  { category: 'pickup', input: 'Drive to the supplier to collect six lengths of gutter for Smith Road', expectedText: ['six lengths', 'gutter'], expectedLocation: 'the supplier' },
  { category: 'pickup', input: 'Head to Mitre 10 and buy ten downpipe clips for Angela Place', expectedText: ['10 downpipe clips'], expectedLocation: 'Mitre 10' },
  { category: 'pickup', input: 'Go to Bunnings this morning to get the sealant', expectedText: ['sealant'], expectedLocation: 'Bunnings' },
  { category: 'pickup', input: 'Collect the brackets from the supplier at 12 Queen Street', expectedText: ['brackets'], expectedLocation: '12 Queen Street' },

  // Drop-off and movement: a complete destination request should be executable.
  { category: 'dropoff', input: 'Drop off clips to 64 Grace James Road in Pukekohe at 4pm today', expectedText: ['drop off', 'clips'], expectedLocation: '64 Grace James Road' },
  { category: 'dropoff', input: 'I need to drop off the keys at Angela Place tomorrow', expectedText: ['keys'], expectedLocation: 'Angela Place' },
  { category: 'dropoff', input: 'Deliver the signed quote to Henderson Road at 3pm', expectedText: ['deliver', 'signed quote'], expectedLocation: 'Henderson Road' },
  { category: 'dropoff', input: 'Take the materials to Smith Road on Monday', expectedText: ['materials'], expectedLocation: 'Smith Road' },
  { category: 'dropoff', input: 'Leave the samples at 8 King Street', expectedText: ['samples'], expectedLocation: '8 King Street' },
  { category: 'dropoff', input: 'Drop off the clips at 64 Grace James Road at 12pm today', expectedText: ['clips'], expectedLocation: '64 Grace James Road' },
  { category: 'movement', input: 'Drive to Smith Road to measure the roof', expectedText: ['measure', 'roof'], expectedLocation: 'Smith Road' },
  { category: 'movement', input: 'Go to Angela Place to inspect the flashing', expectedText: ['inspect', 'flashing'], expectedLocation: 'Angela Place' },

  // Site work and trade tasks.
  { category: 'site-work', input: 'Check the flashing at 12 Queen Street on Monday', expectedText: ['check', 'flashing'], expectedLocation: '12 Queen Street' },
  { category: 'site-work', input: 'Measure the roof at Smith Road', expectedText: ['measure', 'roof'], expectedLocation: 'Smith Road' },
  { category: 'site-work', input: 'Fix the leak at 8 King Street', expectedText: ['fix', 'leak'], expectedLocation: '8 King Street' },
  { category: 'site-work', input: 'Repair the gutter at Henderson Road', expectedText: ['repair', 'gutter'], expectedLocation: 'Henderson Road' },
  { category: 'site-work', input: 'Install the downpipes at Angela Place', expectedText: ['install', 'downpipes'], expectedLocation: 'Angela Place' },
  { category: 'site-work', input: 'Replace the flashing at 20 Queen Road', expectedText: ['replace', 'flashing'], expectedLocation: '20 Queen Road' },
  { category: 'site-work', input: 'Write a quote for the client', expectedText: ['quote'] },
  { category: 'site-work', input: 'Check the flashings for Smith Street', expectedText: ['check', 'flashings'], expectedLocation: 'Smith Street' },

  // Temporal metadata must not be mistaken for a job reference or task content.
  { category: 'time', input: 'Call Jordan at 4pm today about Angela Place', expectedText: ['call jordan'], expectedLocation: 'Angela Place' },
  { category: 'time', input: 'Email Sarah tomorrow about the quote for Smith Road', expectedText: ['email sarah', 'quote'], expectedLocation: 'Smith Road' },
  { category: 'time', input: 'Pick up the materials from Bunnings at 2pm today', expectedText: ['materials'], expectedLocation: 'Bunnings' },
  { category: 'time', input: 'Drop off the clips at Angela Place at 4:30pm tomorrow', expectedText: ['clips'], expectedLocation: 'Angela Place' },
  { category: 'time', input: 'I need to go to Bunnings this morning to grab materials', expectedText: ['materials'], expectedLocation: 'Bunnings' },
  { category: 'time', input: 'There is a meeting at 10am and I need to call Jordan about the quote', expectedText: ['call jordan', 'quote'] },

  // Spoken corrections and messy-but-clear requests.
  { category: 'messy-speech', input: 'I need to, um, call Jordan and get the measurements for Angela Place', expectedText: ['call jordan', 'measurements'], expectedLocation: 'Angela Place' },
  { category: 'messy-speech', input: 'I need to call Jordan — actually, to get the downpipe measurements for Angela Place', expectedText: ['call jordan', 'measurements'], expectedLocation: 'Angela Place' },
  { category: 'messy-speech', input: 'Please call Jordan about the measurements for 12 Queen Street today', expectedText: ['call jordan', 'measurements'], expectedLocation: '12 Queen Street' },
  { category: 'materials', input: 'Buy four tubes of white MS at Bunnings', expectedText: ['four tubes', 'white ms'], expectedLocation: 'Bunnings' },
  { category: 'materials', input: 'Order ten downpipe clips for Angela Place', expectedText: ['10 downpipe clips'], expectedLocation: 'Angela Place' },
  { category: 'materials', input: 'Purchase flashing for 12 Queen Street', expectedText: ['flashing'], expectedLocation: '12 Queen Street' },
  { category: 'materials', input: 'Get six lengths of gutter from the supplier for Smith Road', expectedText: ['six lengths', 'gutter'] },
];

function captureAndDock(input: string): {
  speech: ReturnType<typeof processCaptureSpeech>;
  line: string;
  dock: CaptureDockResult;
} {
  const speech = processCaptureSpeech({ text: input, todayIso: '2026-10-09' });
  const line = textForCaptureField(speech);
  const dock = runCaptureDock({
    line,
    userId: null,
    priorRequest: null,
    jobs: [
      { id: 'job-angela', name: 'Angela Place', locationText: '12 Angela Place' },
      { id: 'job-grace', name: 'Grace James Road', locationText: '64 Grace James Road' },
      { id: 'job-smith', name: 'Smith Road', locationText: 'Smith Road' },
    ],
    captureJobId: null,
    captureSurfaceDate: '2026-10-09',
    remainingMinsToday: 240,
    openTaskCount: 0,
    inputType: 'speech_transcript',
    meetings: [{ id: 'meeting-1', text: 'Site meeting at 10am', startAt: '2026-10-09T10:00:00' }],
  });
  return { speech, line, dock };
}

describe('Phase 18 — end-to-end Capture → speech → Dock torture suite', () => {
  it('contains at least 40 varied, categorized natural-language requests', () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
    expect(new Set(cases.map((testCase) => testCase.category)).size).toBeGreaterThanOrEqual(7);
  });

  it.each(cases)('$category: $input', ({ input, expectedText, expectedLocation }) => {
    const { line, dock } = captureAndDock(input);

    // A complete actionable request should not be blocked by a clarification gate.
    expect(
      ['act_create', 'act_update'].includes(dock.kind),
      `Unexpected Dock result for: ${input}\nCapture field: ${line}\nDock result: ${JSON.stringify(
        dock.kind === 'act_create' || dock.kind === 'act_update'
          ? { kind: dock.kind, text: dock.overrides.text, location: dock.overrides.locationText, message: dock.message }
          : { kind: dock.kind, message: dock.message },
      )}`,
    ).toBe(true);

    if (dock.kind === 'act_create' || dock.kind === 'act_update') {
      const taskText = dock.overrides.text.toLowerCase();
      for (const anchor of expectedText ?? []) {
        expect(taskText, `Missing semantic anchor "${anchor}" for: ${input}\nActual task: ${dock.overrides.text}`).toContain(anchor.toLowerCase());
      }
      if (expectedLocation) {
        expect(
          dock.overrides.locationText?.toLowerCase(),
          `Wrong/missing location for: ${input}\nActual location: ${dock.overrides.locationText}`,
        ).toContain(expectedLocation.toLowerCase());
      }
    }
  });

  it('does not turn genuine fresh tasks into reference clarifications when unrelated context exists', () => {
    for (const input of [
      'I need to go to Bunnings this morning to grab materials',
      'There is a meeting at 10am and I need to call Jordan about the quote',
      'Drop off clips to 64 Grace James Road in Pukekohe at 4pm today',
    ]) {
      const { dock } = captureAndDock(input);
      expect(dock.kind, `Fresh task incorrectly gated: ${input}; result=${dock.kind}`).not.toBe('clarify');
    }
  });
});
