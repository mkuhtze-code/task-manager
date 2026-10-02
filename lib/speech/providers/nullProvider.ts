import type { SpeechInput, SpeechTranscriptionProvider, TranscriptionResult } from '../types';

/**
 * Placeholder when no STT is configured.
 * Fails clearly so callers can queue / retry / fall back to text.
 * Does not invent transcripts.
 */
export const nullTranscriptionProvider: SpeechTranscriptionProvider = {
  id: 'null',
  version: '1.0.0',
  supportsOffline: false,
  async transcribe(_input: SpeechInput): Promise<TranscriptionResult> {
    throw new Error(
      'No speech transcription provider configured. Capture is preserved; configure a provider or enter text.'
    );
  },
};
