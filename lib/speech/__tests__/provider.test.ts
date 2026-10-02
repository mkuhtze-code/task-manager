import { describe, expect, it, afterEach } from 'vitest';
import {
  getTranscriptionProvider,
  setTranscriptionProvider,
  resetTranscriptionProvider,
  nullTranscriptionProvider,
} from '../providers';
import type { SpeechTranscriptionProvider, TranscriptionResult } from '../types';
import { createSpeechSession, transcribeSession, runSpeechPipeline } from '../pipeline';

afterEach(() => {
  resetTranscriptionProvider();
});

describe('transcription provider abstraction', () => {
  it('defaults to null provider that fails clearly', async () => {
    const p = getTranscriptionProvider();
    expect(p.id).toBe('null');
    await expect(p.transcribe({})).rejects.toThrow(/No speech transcription provider/);
  });

  it('allows swapping provider', async () => {
    const fake: SpeechTranscriptionProvider = {
      id: 'fake',
      version: '0.0.1',
      async transcribe(): Promise<TranscriptionResult> {
        return {
          text: 'Call John tomorrow.',
          confidence: 0.9,
          provider: 'fake',
          providerVersion: '0.0.1',
          createdAt: new Date().toISOString(),
        };
      },
    };
    setTranscriptionProvider(fake);
    expect(getTranscriptionProvider().id).toBe('fake');
    const session = createSpeechSession({ status: 'captured' });
    const next = await transcribeSession(session);
    expect(next.status).toBe('transcribed');
    expect(next.transcript?.text).toMatch(/John/);
  });

  it('runSpeechPipeline with text skips provider', async () => {
    const result = await runSpeechPipeline({ text: 'Call John tomorrow.' });
    expect(result.interpretation?.entities.some((e) => /john/i.test(e.raw))).toBe(true);
  });

  it('failed transcription leaves session recoverable', async () => {
    setTranscriptionProvider(nullTranscriptionProvider);
    const session = createSpeechSession({
      status: 'captured',
      audioRef: 'idb://test-audio',
    });
    const next = await transcribeSession(session);
    expect(next.status).toBe('queued_transcription');
    expect(next.audioRef).toBe('idb://test-audio');
    expect(next.error).toBeTruthy();
  });
});
