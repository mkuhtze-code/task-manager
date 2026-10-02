import { describe, expect, it } from 'vitest';
import { interpretSpeech } from '../interpret';
import { processSpeechText } from '../pipeline';

describe('interpretSpeech — required scenarios', () => {
  it('basic: Call John tomorrow', () => {
    const i = interpretSpeech('Call John tomorrow.');
    expect(i.intent).toMatch(/create|remember|plan/);
    expect(i.entities.some((e) => /john/i.test(e.raw))).toBe(true);
    expect(i.temporalReferences.some((t) => t.kind === 'tomorrow')).toBe(true);
    expect(i.surfaceSummary.toLowerCase()).toMatch(/john/);
  });

  it('filler: Um, I need to, uh, call John tomorrow', () => {
    const i = interpretSpeech('Um, I need to, uh, call John tomorrow.');
    expect(i.normalisedText.toLowerCase()).not.toMatch(/\bum\b/);
    expect(i.entities.some((e) => /john/i.test(e.raw))).toBe(true);
  });

  it('correction: Call John tomorrow, actually Friday', () => {
    const i = interpretSpeech('Call John tomorrow, actually Friday.');
    expect(i.corrections.length).toBeGreaterThan(0);
    expect(
      i.temporalReferences.some((t) => /friday/i.test(t.raw) || t.isCorrection)
    ).toBe(true);
  });

  it('replacement time: Meet Sarah at three, no, four', () => {
    const i = interpretSpeech('Meet Sarah at three, no, four.');
    expect(i.corrections.length).toBeGreaterThan(0);
    expect(i.surfaceSummary.toLowerCase()).toMatch(/sarah|four|meet/);
  });

  it('spoken punctuation', () => {
    const i = interpretSpeech("Send Mike a message comma I'll call him tomorrow period.");
    expect(i.normalisedText).toMatch(/,/);
    expect(i.normalisedText).toMatch(/\./);
  });

  it('relative date: day after tomorrow', () => {
    const i = interpretSpeech('Do that the day after tomorrow.', {
      todayIso: '2026-10-02',
    });
    expect(i.temporalReferences.some((t) => t.resolvedDate === '2026-10-04')).toBe(true);
  });

  it('uncertainty: probably get that done tomorrow', () => {
    const i = interpretSpeech("I'll probably get that done tomorrow.");
    expect(i.certainty).toMatch(/probable|tentative|uncertain/);
    expect(i.commitmentStrength).toMatch(/weak|moderate|none/);
  });

  it('strong commitment', () => {
    const i = interpretSpeech('I absolutely need to get that done tomorrow.');
    expect(i.commitmentStrength).toBe('strong');
    expect(i.certainty).toMatch(/definite|likely/);
  });

  it('ambiguity: Maybe sometime next week', () => {
    const i = interpretSpeech('Maybe sometime next week.');
    expect(i.ambiguity).toMatch(/high|partial/);
    expect(i.requiresConfirmation).toBe(true);
    expect(i.certainty).toMatch(/uncertain|speculative|tentative/);
  });

  it('thinking aloud with constraint', () => {
    const i = interpretSpeech(
      'I need to call John. Actually, maybe after the meeting because I need to ask him about the Henderson job.'
    );
    expect(
      i.constraints.some((c) => c === 'dependency' || c === 'person_dependency')
    ).toBe(true);
  });

  it('entity correction job', () => {
    const i = interpretSpeech(
      'Create a job for Henderson roof — sorry, Henderson extension.'
    );
    expect(i.corrections.length).toBeGreaterThan(0);
    expect(i.normalisedText.toLowerCase()).toContain('extension');
  });

  it('multiple actions still produces interpretation', () => {
    const i = interpretSpeech('Call John tomorrow and send Sarah the invoice Friday.');
    expect(i.normalisedText.length).toBeGreaterThan(0);
    expect(i.entities.length).toBeGreaterThanOrEqual(1);
  });

  it('natural variants converge without robotic commands', () => {
    const variants = [
      'I need to call John tomorrow.',
      'Remember to call John tomorrow.',
      'Can you remind me to call John tomorrow?',
      'Need to call John tomorrow.',
      "I really don't want to forget to call John tomorrow.",
    ];
    for (const v of variants) {
      const i = interpretSpeech(v);
      expect(i.entities.some((e) => /john/i.test(e.raw))).toBe(true);
      expect(i.temporalReferences.some((t) => t.kind === 'tomorrow')).toBe(true);
    }
  });

  it('does not invent certainty on empty', () => {
    const i = interpretSpeech('');
    expect(i.confidence).toBe('low');
    expect(i.intent).toBe('unknown');
  });
});

describe('processSpeechText pipeline', () => {
  it('returns session + interpretation', () => {
    const { session, interpretation } = processSpeechText('Call John tomorrow.');
    expect(session.status).toBe('interpreted');
    expect(interpretation?.surfaceSummary.toLowerCase()).toMatch(/john/);
  });
});
