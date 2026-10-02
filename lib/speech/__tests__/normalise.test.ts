import { describe, expect, it } from 'vitest';
import {
  normaliseSpeech,
  stripFillers,
  applySpokenPunctuation,
  detectCorrections,
  expandSpokenNumbers,
  extractTemporals,
} from '../normalise';

describe('stripFillers', () => {
  it('removes um/uh without destroying meaning', () => {
    const { text, removed } = stripFillers('Um, I need to, uh, call John tomorrow.');
    expect(text.toLowerCase()).toContain('call john tomorrow');
    expect(removed.some((r) => /um|uh/i.test(r))).toBe(true);
  });

  it('does not strip meaningful like after I', () => {
    const { text } = stripFillers('I like the Henderson job');
    expect(text.toLowerCase()).toContain('like');
  });
});

describe('spoken punctuation', () => {
  it('maps comma / period / question mark', () => {
    const { text, hits } = applySpokenPunctuation(
      "Send Mike a message comma I'll call him tomorrow period"
    );
    expect(text).toMatch(/message,/i);
    expect(text).toMatch(/tomorrow\./i);
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});

describe('corrections / backtracking', () => {
  it('Call John tomorrow, actually Friday', () => {
    const { text, corrections } = detectCorrections('Call John tomorrow, actually Friday.');
    expect(corrections.length).toBeGreaterThanOrEqual(1);
    expect(corrections[0].correctedRaw.toLowerCase()).toContain('friday');
    expect(text.toLowerCase()).toContain('friday');
  });

  it('Meet Sarah at three, no, four', () => {
    const { text, corrections } = detectCorrections('Meet Sarah at three, no, four.');
    expect(corrections.length).toBeGreaterThanOrEqual(1);
    expect(text.toLowerCase()).toMatch(/four/);
  });

  it('entity correction Henderson roof → extension', () => {
    const { text, corrections } = detectCorrections(
      'Create a job for Henderson roof — sorry, Henderson extension.'
    );
    expect(corrections.length).toBeGreaterThanOrEqual(1);
    expect(text.toLowerCase()).toContain('extension');
  });
});

describe('spoken numbers', () => {
  it('expands twenty five', () => {
    const { text, expansions } = expandSpokenNumbers('job twenty five');
    expect(text).toMatch(/25/);
    expect(expansions.length).toBeGreaterThan(0);
  });

  it('expands three thirty to clock', () => {
    const { text } = expandSpokenNumbers('Meet Sarah at three thirty');
    expect(text).toMatch(/3:30/);
  });
});

describe('temporals', () => {
  const today = '2026-10-02'; // Friday

  it('tomorrow', () => {
    const refs = extractTemporals('call John tomorrow', today);
    expect(refs.some((r) => r.kind === 'tomorrow' && r.resolvedDate === '2026-10-03')).toBe(true);
  });

  it('day after tomorrow', () => {
    const refs = extractTemporals('Do that the day after tomorrow.', today);
    expect(refs.some((r) => r.resolvedDate === '2026-10-04')).toBe(true);
  });

  it('vague sometime next week stays low confidence', () => {
    const refs = extractTemporals('Maybe sometime next week.', today);
    expect(refs.some((r) => r.kind === 'vague' && r.confidence === 'low')).toBe(true);
  });
});

describe('normaliseSpeech pipeline', () => {
  it('basic call John tomorrow', () => {
    const r = normaliseSpeech('Call John tomorrow.');
    expect(r.normalisedText.toLowerCase()).toContain('call john tomorrow');
    expect(r.temporals.some((t) => t.kind === 'tomorrow')).toBe(true);
  });

  it('filler + correction', () => {
    const r = normaliseSpeech('Um, call John tomorrow, actually Friday.');
    expect(r.fillersRemoved.length).toBeGreaterThan(0);
    expect(r.corrections.length).toBeGreaterThan(0);
    expect(r.normalisedText.toLowerCase()).toContain('friday');
  });

  it('empty speech', () => {
    const r = normaliseSpeech('   ');
    expect(r.normalisedText).toBe('');
    expect(r.confidence).toBe('low');
  });
});
