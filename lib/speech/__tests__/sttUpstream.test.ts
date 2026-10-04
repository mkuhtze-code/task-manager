import { describe, it, expect, vi } from 'vitest';
import {
  parseSttUpstreamConfig,
  assertAudioSize,
  transcribeUpstream,
} from '../sttUpstream';

describe('sttUpstream', () => {
  it('parse returns null without api key', () => {
    expect(parseSttUpstreamConfig({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('parse deepgram defaults', () => {
    const c = parseSttUpstreamConfig({
      DOKKIT_STT_API_KEY: 'k',
    } as NodeJS.ProcessEnv);
    expect(c?.provider).toBe('deepgram');
    expect(c?.apiKey).toBe('k');
  });

  it('assertAudioSize rejects empty', () => {
    expect(() => assertAudioSize(0)).toThrow(/empty/i);
  });

  it('deepgram path extracts transcript', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: {
          channels: [{ alternatives: [{ transcript: 'check flashing', confidence: 0.9 }] }],
        },
      }),
      text: async () => '',
      status: 200,
    }));
    const result = await transcribeUpstream(
      new TextEncoder().encode('fake').buffer,
      'audio/webm',
      { provider: 'deepgram', apiKey: 'k', language: 'en-NZ' },
      fetchImpl as unknown as typeof fetch
    );
    expect(result.text).toBe('check flashing');
    expect(result.provider).toBe('deepgram');
  });
});
