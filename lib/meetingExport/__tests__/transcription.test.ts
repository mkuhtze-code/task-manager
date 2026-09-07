import { describe, expect, it } from 'vitest';
import {
  registerMeetingTranscriptionProvider,
  transcribeAssets,
  transcriptionProviders,
  type MeetingTranscriptionAsset,
  type MeetingTranscriptionProvider,
} from '@/lib/meetingExport/transcription';

function asset(id: string): MeetingTranscriptionAsset {
  return {
    mediaId: id,
    localUri: `idb://${id}`,
    mimeType: 'audio/m4a',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/m4a' }),
    capturedAt: '2025-01-02T09:20:00',
  };
}

function provider(id: string, textFor: (id: string) => Promise<string | null>): MeetingTranscriptionProvider {
  return { id, transcribe: async (a) => textFor(a.mediaId) };
}

describe('transcribeAssets', () => {
  it('is completed (nothing to do) with no assets and no providers', async () => {
    const outcome = await transcribeAssets([], []);
    expect(outcome.status).toBe('completed');
    expect(outcome.transcripts.size).toBe(0);
    expect(outcome.error).toBeNull();
  });

  it('fails with a helpful reason when providers exist for nothing', async () => {
    const outcome = await transcribeAssets([asset('a1')], []);
    expect(outcome.status).toBe('failed');
    expect(outcome.error).toContain('No transcription provider');
    expect(outcome.transcripts.size).toBe(0);
  });

  it('collects transcripts and reports completed when every asset transcribed', async () => {
    const outcome = await transcribeAssets([asset('a1'), asset('a2')], [
      provider('fake', async (id) => `Transcript of ${id}`),
    ]);
    expect(outcome.status).toBe('completed');
    expect(outcome.error).toBeNull();
    expect(outcome.transcripts.get('a1')).toBe('Transcript of a1');
    expect(outcome.transcripts.get('a2')).toBe('Transcript of a2');
  });

  it('trims whitespace-only transcripts and counts them as failures', async () => {
    const outcome = await transcribeAssets([asset('a1')], [provider('fake', async () => '   ')]);
    expect(outcome.status).toBe('failed');
    expect(outcome.transcripts.size).toBe(0);
    expect(outcome.error).toContain('Some voice notes could not be transcribed');
  });

  it('moves to the next provider when one throws or returns nothing', async () => {
    const outcome = await transcribeAssets([asset('a1')], [
      provider('broken', async () => {
        throw new Error('boom');
      }),
      provider('works', async () => 'Recovered transcript'),
    ]);
    expect(outcome.status).toBe('completed');
    expect(outcome.transcripts.get('a1')).toBe('Recovered transcript');
  });

  it('marks failed when some assets produced no transcript', async () => {
    const outcome = await transcribeAssets([asset('a1'), asset('a2')], [
      provider('half', async (id) => (id === 'a1' ? 'Yes' : null)),
    ]);
    expect(outcome.status).toBe('failed');
    expect(outcome.transcripts.get('a1')).toBe('Yes');
    expect(outcome.transcripts.has('a2')).toBe(false);
  });
});

describe('provider registry', () => {
  it('registers and dedupes by id', () => {
    const p = { id: 'registry-test', transcribe: async () => 'x' };
    registerMeetingTranscriptionProvider(p);
    registerMeetingTranscriptionProvider(p);
    registerMeetingTranscriptionProvider({ id: 'registry-test', transcribe: async () => 'y' });
    const ids = transcriptionProviders().map((x) => x.id);
    expect(ids.filter((x) => x === 'registry-test')).toHaveLength(1);
  });
});