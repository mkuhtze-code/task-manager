/**
 * Server-side upstream STT adapters.
 * Secrets stay here — never shipped to the browser.
 * Does not invent transcripts; empty upstream text is an error.
 */

export type SttUpstreamResult = {
  text: string;
  confidence?: number;
  language?: string;
  provider: string;
  raw?: unknown;
};

export type SttUpstreamConfig = {
  provider: 'deepgram' | 'openai' | 'generic';
  apiKey: string;
  /** Override default provider URL */
  upstreamUrl?: string;
  language?: string;
};

const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // 8 MB

export function parseSttUpstreamConfig(env: NodeJS.ProcessEnv = process.env): SttUpstreamConfig | null {
  const apiKey = (env.DOKKIT_STT_API_KEY || env.STT_API_KEY || '').trim();
  if (!apiKey) return null;

  const providerRaw = (env.DOKKIT_STT_PROVIDER || 'deepgram').trim().toLowerCase();
  const provider =
    providerRaw === 'openai' || providerRaw === 'whisper'
      ? 'openai'
      : providerRaw === 'generic'
        ? 'generic'
        : 'deepgram';

  const upstreamUrl = (env.DOKKIT_STT_UPSTREAM_URL || '').trim() || undefined;
  const language = (env.DOKKIT_STT_LANGUAGE || env.NEXT_PUBLIC_DOKKIT_STT_LANGUAGE || 'en-NZ').trim();

  return { provider, apiKey, upstreamUrl, language };
}

export function assertAudioSize(byteLength: number): void {
  if (byteLength <= 0) throw new Error('Empty audio payload.');
  if (byteLength > MAX_AUDIO_BYTES) {
    throw new Error(`Audio too large (max ${MAX_AUDIO_BYTES} bytes).`);
  }
}

/**
 * Call configured upstream with raw audio bytes.
 */
export async function transcribeUpstream(
  audio: ArrayBuffer,
  mimeType: string,
  config: SttUpstreamConfig,
  fetchImpl: typeof fetch = fetch
): Promise<SttUpstreamResult> {
  assertAudioSize(audio.byteLength);

  if (config.provider === 'deepgram') {
    return transcribeDeepgram(audio, mimeType, config, fetchImpl);
  }
  if (config.provider === 'openai') {
    return transcribeOpenAI(audio, mimeType, config, fetchImpl);
  }
  return transcribeGeneric(audio, mimeType, config, fetchImpl);
}

async function transcribeDeepgram(
  audio: ArrayBuffer,
  mimeType: string,
  config: SttUpstreamConfig,
  fetchImpl: typeof fetch
): Promise<SttUpstreamResult> {
  const lang = (config.language || 'en-NZ').replace('_', '-');
  const base =
    config.upstreamUrl ||
    `https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=${encodeURIComponent(lang)}`;

  const res = await fetchImpl(base, {
    method: 'POST',
    headers: {
      Authorization: `Token ${config.apiKey}`,
      'Content-Type': mimeType || 'audio/webm',
    },
    body: audio,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Deepgram STT failed (${res.status}): ${detail.slice(0, 240)}`);
  }

  const body = (await res.json()) as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{ transcript?: string; confidence?: number }>;
      }>;
    };
  };

  const alt = body.results?.channels?.[0]?.alternatives?.[0];
  const text = (alt?.transcript ?? '').trim();
  if (!text) throw new Error('Deepgram returned empty transcript.');

  return {
    text,
    confidence: typeof alt?.confidence === 'number' ? alt.confidence : undefined,
    language: config.language,
    provider: 'deepgram',
    raw: body,
  };
}

async function transcribeOpenAI(
  audio: ArrayBuffer,
  mimeType: string,
  config: SttUpstreamConfig,
  fetchImpl: typeof fetch
): Promise<SttUpstreamResult> {
  const url = config.upstreamUrl || 'https://api.openai.com/v1/audio/transcriptions';
  const form = new FormData();
  const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a' : 'webm';
  form.append('file', new Blob([audio], { type: mimeType || 'audio/webm' }), `speech.${ext}`);
  form.append('model', 'whisper-1');
  if (config.language) {
    form.append('language', config.language.slice(0, 2).toLowerCase());
  }

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenAI STT failed (${res.status}): ${detail.slice(0, 240)}`);
  }

  const body = (await res.json()) as { text?: string };
  const text = (body.text ?? '').trim();
  if (!text) throw new Error('OpenAI returned empty transcript.');

  return {
    text,
    language: config.language,
    provider: 'openai',
    raw: body,
  };
}

async function transcribeGeneric(
  audio: ArrayBuffer,
  mimeType: string,
  config: SttUpstreamConfig,
  fetchImpl: typeof fetch
): Promise<SttUpstreamResult> {
  if (!config.upstreamUrl) {
    throw new Error('Generic STT requires DOKKIT_STT_UPSTREAM_URL.');
  }

  const form = new FormData();
  form.append('audio', new Blob([audio], { type: mimeType || 'audio/webm' }), 'speech.webm');
  form.append('language', config.language || 'en-NZ');

  const res = await fetchImpl(config.upstreamUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Generic STT failed (${res.status}): ${detail.slice(0, 240)}`);
  }

  const body = (await res.json()) as {
    text?: string;
    transcript?: string;
    confidence?: number;
    language?: string;
  };
  const text = (body.text ?? body.transcript ?? '').trim();
  if (!text) throw new Error('Upstream STT returned empty transcript.');

  return {
    text,
    confidence: typeof body.confidence === 'number' ? body.confidence : undefined,
    language: body.language || config.language,
    provider: 'generic',
    raw: body,
  };
}
