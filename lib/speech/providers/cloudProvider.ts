/**
 * Cloud / HTTP STT provider — swappable behind SpeechTranscriptionProvider.
 *
 * Does not invent transcripts. Requires an endpoint that accepts audio and
 * returns JSON `{ text: string, confidence?: number, language?: string }`.
 *
 * Typical production shape:
 * - Browser posts blob to your own `/api/stt` (keeps API keys server-side)
 * - That route calls Deepgram / AssemblyAI / Whisper / etc.
 *
 * Without endpoint config, createCloudTranscriptionProvider throws on use;
 * cloudProviderFromEnv() returns null so callers keep Web Speech / null.
 */

import type {
  SpeechInput,
  SpeechTranscriptionProvider,
  TranscriptionResult,
} from '../types';

export type CloudSttConfig = {
  /** Absolute or same-origin URL that accepts POST multipart/form-data `audio`. */
  endpoint: string;
  /** Optional bearer / API key header (prefer server proxy — avoid shipping secrets). */
  apiKey?: string;
  language?: string;
  /** Extra form fields (e.g. model id). */
  formFields?: Record<string, string>;
  fetchImpl?: typeof fetch;
};

type CloudSttJson = {
  text?: string;
  transcript?: string;
  confidence?: number;
  language?: string;
  error?: string;
};

function resolveText(body: CloudSttJson): string {
  const t = (body.text ?? body.transcript ?? '').trim();
  return t;
}

export function createCloudTranscriptionProvider(
  config: CloudSttConfig
): SpeechTranscriptionProvider {
  const endpoint = (config.endpoint ?? '').trim();
  if (!endpoint) {
    throw new Error('Cloud STT endpoint is required.');
  }

  const fetchFn = config.fetchImpl ?? fetch;

  return {
    id: 'cloud-http',
    version: '1.0.0',
    supportsOffline: false,

    async transcribe(input: SpeechInput): Promise<TranscriptionResult> {
      const blob = input.blob;
      if (!blob) {
        throw new Error(
          'Cloud STT requires an audio blob. Live mic should use recognizeLive (Web Speech) or record then transcribe.'
        );
      }

      const form = new FormData();
      const mime = input.mimeType || blob.type || 'audio/webm';
      form.append('audio', blob, `speech.${mime.includes('mp4') ? 'm4a' : 'webm'}`);
      form.append('language', config.language || input.languageHint || 'en-NZ');
      if (config.formFields) {
        for (const [k, v] of Object.entries(config.formFields)) {
          form.append(k, v);
        }
      }

      const headers: Record<string, string> = {};
      if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }

      const started = Date.now();
      const res = await fetchFn(endpoint, {
        method: 'POST',
        headers,
        body: form,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(
          `Cloud STT failed (${res.status}): ${detail.slice(0, 200) || res.statusText}`
        );
      }

      const body = (await res.json()) as CloudSttJson;
      if (body.error) {
        throw new Error(`Cloud STT error: ${body.error}`);
      }
      const text = resolveText(body);
      if (!text) {
        throw new Error('Cloud STT returned empty transcript.');
      }

      return {
        text,
        language: body.language || config.language || input.languageHint || 'en-NZ',
        confidence:
          typeof body.confidence === 'number' ? body.confidence : undefined,
        durationMs: input.durationMs ?? Date.now() - started,
        provider: 'cloud-http',
        providerVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        raw: body,
      };
    },
  };
}

/**
 * Build provider from public env when set.
 * Prefer a same-origin proxy URL so secrets never reach the browser.
 */
export function cloudProviderFromEnv(
  env: {
    endpoint?: string | null;
    apiKey?: string | null;
    language?: string | null;
  } = {}
): SpeechTranscriptionProvider | null {
  const endpoint =
    (env.endpoint ??
      (typeof process !== 'undefined'
        ? process.env.NEXT_PUBLIC_DOKKIT_STT_ENDPOINT
        : undefined) ??
      '')
      .toString()
      .trim();
  if (!endpoint) return null;

  const apiKey =
    (env.apiKey ??
      (typeof process !== 'undefined'
        ? process.env.NEXT_PUBLIC_DOKKIT_STT_API_KEY
        : undefined) ??
      undefined) || undefined;

  const language =
    (env.language ??
      (typeof process !== 'undefined'
        ? process.env.NEXT_PUBLIC_DOKKIT_STT_LANGUAGE
        : undefined) ??
      'en-NZ') || 'en-NZ';

  return createCloudTranscriptionProvider({
    endpoint,
    apiKey: apiKey || undefined,
    language,
  });
}
