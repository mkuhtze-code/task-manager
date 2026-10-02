/**
 * Web Speech API transcription provider (browser only).
 *
 * Limits (honest):
 * - Does NOT transcribe stored Blob / IndexedDB audio.
 * - Live recognition is a separate capture-time path (see recognizeLive).
 * - Availability is feature-detected; missing API fails clearly.
 *
 * Stored audio → use a server/cloud STT provider later.
 * This provider exists so the engine has a real, swappable non-null option.
 */

import type { SpeechInput, SpeechTranscriptionProvider, TranscriptionResult } from '../types';

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: SpeechRecognitionResultListLike }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: { isFinal: boolean; 0: { transcript: string; confidence: number } };
};

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isWebSpeechAvailable(): boolean {
  return getSpeechRecognitionCtor() != null;
}

/**
 * Live, intentional recognition session (not blob transcription).
 * Caller owns mic permission + start/stop UX — this is engine only.
 */
export function recognizeLive(options?: {
  language?: string;
  timeoutMs?: number;
}): Promise<TranscriptionResult> {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    return Promise.reject(
      new Error('Web Speech API is not available in this browser.')
    );
  }

  const timeoutMs = options?.timeoutMs ?? 15_000;
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const rec = new Ctor();
    rec.lang = options?.language ?? 'en-NZ';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      reject(new Error('Web Speech recognition timed out.'));
    }, timeoutMs);

    rec.onresult = (ev) => {
      if (settled) return;
      const first = ev.results?.[0]?.[0];
      const text = first?.transcript?.trim() ?? '';
      if (!text) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        text,
        language: options?.language ?? 'en-NZ',
        confidence: typeof first?.confidence === 'number' ? first.confidence : undefined,
        durationMs: Date.now() - started,
        provider: 'web-speech',
        providerVersion: '1.0.0',
        createdAt: new Date().toISOString(),
      });
    };

    rec.onerror = (ev) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Web Speech error: ${ev.error ?? 'unknown'}`));
    };

    rec.onend = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('Web Speech ended without a final transcript.'));
    };

    try {
      rec.start();
    } catch (err) {
      settled = true;
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error('Web Speech failed to start'));
    }
  });
}

/**
 * Provider conforming to SpeechTranscriptionProvider.
 * Stored audio is not supported — fails clearly so the pipeline can queue.
 */
export const webSpeechProvider: SpeechTranscriptionProvider = {
  id: 'web-speech',
  version: '1.0.0',
  supportsOffline: false,

  async transcribe(input: SpeechInput): Promise<TranscriptionResult> {
    if (input.blob || input.audioRef) {
      throw new Error(
        'Web Speech cannot transcribe stored audio. Use a cloud STT provider, or capture live with recognizeLive().'
      );
    }
    throw new Error(
      'Web Speech provider requires live recognition via recognizeLive(), not offline blob input.'
    );
  },
};
