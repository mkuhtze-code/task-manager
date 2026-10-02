import { describe, expect, it, afterEach } from 'vitest';
import {
  getTranscriptionProvider,
  setTranscriptionProvider,
  resetTranscriptionProvider,
  webSpeechProvider,
  isWebSpeechAvailable,
} from '../providers';
import { runSpeechBenchmark, runMustNotCorrectAudit } from '../benchmark';
import { extractActionClauses, hasMultiActionCandidate } from '../multiClause';
import { normaliseSpeech } from '../normalise';

describe('phase4 — web speech provider', () => {
  afterEach(() => {
    resetTranscriptionProvider();
  });

  it('rejects stored blob input clearly', async () => {
    await expect(
      webSpeechProvider.transcribe({
        blob: new Blob(['x'], { type: 'audio/webm' }),
      })
    ).rejects.toThrow(/stored audio|live recognition/i);
  });

  it('rejects empty input clearly', async () => {
    await expect(webSpeechProvider.transcribe({})).rejects.toThrow(/live recognition/i);
  });

  it('can be set as active provider', () => {
    setTranscriptionProvider(webSpeechProvider);
    expect(getTranscriptionProvider().id).toBe('web-speech');
  });

  it('isWebSpeechAvailable is boolean (false in node)', () => {
    expect(typeof isWebSpeechAvailable()).toBe('boolean');
    expect(isWebSpeechAvailable()).toBe(false);
  });
});

describe('phase4 — multi-clause candidates', () => {
  it('detects two actions joined by and', () => {
    const text = 'Call John tomorrow and send Sarah the invoice on Friday.';
    expect(hasMultiActionCandidate(text)).toBe(true);
    const clauses = extractActionClauses(text);
    expect(clauses.length).toBeGreaterThanOrEqual(2);
  });

  it('does not force multi on single action', () => {
    expect(hasMultiActionCandidate('Call John tomorrow.')).toBe(false);
  });
});

describe('phase4 — quality gates', () => {
  it('must-not-correct audit has no false positives', () => {
    const audit = runMustNotCorrectAudit();
    expect(audit.failed, JSON.stringify(audit.failed, null, 2)).toEqual([]);
    expect(audit.passed).toBe(audit.total);
  });

  it('benchmark normalisation passes at least 80% of cases', () => {
    const report = runSpeechBenchmark();
    const rate = report.normalisation.passed / report.normalisation.total;
    expect(
      rate,
      `norm fails: ${JSON.stringify(report.normalisation.failed)}`
    ).toBeGreaterThanOrEqual(0.8);
  });

  it('spoken time expands three thirty', () => {
    const n = normaliseSpeech('Meet the tiler at three thirty.');
    expect(n.normalisedText).toMatch(/3:30/);
  });
});
