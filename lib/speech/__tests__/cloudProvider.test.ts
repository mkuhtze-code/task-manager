import { describe, it, expect, vi } from 'vitest';
import {
  createCloudTranscriptionProvider,
  cloudProviderFromEnv,
} from '../providers/cloudProvider';

describe('cloudProvider', () => {
  it('requires endpoint', () => {
    expect(() => createCloudTranscriptionProvider({ endpoint: '' })).toThrow(
      /endpoint/i
    );
  });

  it('requires blob', async () => {
    const p = createCloudTranscriptionProvider({
      endpoint: 'https://example.test/stt',
    });
    await expect(p.transcribe({})).rejects.toThrow(/blob/i);
  });

  it('posts audio and returns text', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'check flashing on site', confidence: 0.91 }),
      text: async () => '',
      status: 200,
      statusText: 'OK',
    }));
    const p = createCloudTranscriptionProvider({
      endpoint: 'https://example.test/stt',
      apiKey: 'secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const blob = new Blob(['fake-audio'], { type: 'audio/webm' });
    const result = await p.transcribe({ blob, mimeType: 'audio/webm' });
    expect(result.text).toBe('check flashing on site');
    expect(result.provider).toBe('cloud-http');
    expect(result.confidence).toBe(0.91);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0];
    expect(call[0]).toBe('https://example.test/stt');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers.Authorization).toBe('Bearer secret');
  });

  it('fails clearly on empty transcript', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: '  ' }),
      text: async () => '',
      status: 200,
      statusText: 'OK',
    }));
    const p = createCloudTranscriptionProvider({
      endpoint: 'https://example.test/stt',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      p.transcribe({ blob: new Blob(['x']) })
    ).rejects.toThrow(/empty/i);
  });

  it('cloudProviderFromEnv returns null without endpoint', () => {
    expect(cloudProviderFromEnv({ endpoint: '' })).toBeNull();
  });

  it('cloudProviderFromEnv builds when endpoint set', () => {
    const p = cloudProviderFromEnv({ endpoint: 'https://example.test/stt' });
    expect(p?.id).toBe('cloud-http');
  });
});
