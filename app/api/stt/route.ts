import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { normalizeSpeechLocale } from '@/lib/speech/locale';
import { checkRateLimit, getClientIp } from '@/lib/ratelimit';
import {
  MAX_AUDIO_BYTES,
  parseSttUpstreamConfig,
  transcribeUpstream,
} from '@/lib/speech/sttUpstream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/stt
 * multipart/form-data: field `audio` (file), optional `language`
 *
 * Proxies to configured upstream (Deepgram / OpenAI / generic).
 * Secrets never leave the server. Does not invent transcripts.
 *
 * Env (server):
 *   DOKKIT_STT_API_KEY (required to enable)
 *   DOKKIT_STT_PROVIDER=deepgram|openai|generic (default deepgram)
 *   DOKKIT_STT_UPSTREAM_URL (optional override / required for generic)
 *   DOKKIT_STT_LANGUAGE (default en-NZ)
 */
export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const ip = getClientIp(req);
  const rl = await checkRateLimit(`stt:${auth.userId}:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many speech requests. Try again shortly.' },
      { status: 429 }
    );
  }

  // Reject oversized uploads before parsing multipart data or allocating an audio buffer.
  const contentLengthHeader = req.headers.get('content-length');
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;
  if (Number.isFinite(contentLength) && contentLength > MAX_AUDIO_BYTES + 256 * 1024) {
    return NextResponse.json({ error: 'Audio too large (max 8 MB).' }, { status: 413 });
  }

  const config = parseSttUpstreamConfig();
  if (!config) {
    return NextResponse.json(
      {
        error:
          'Cloud STT is not configured. Set DOKKIT_STT_API_KEY (and optional DOKKIT_STT_PROVIDER) on the server.',
        not_configured: true,
      },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data.' }, { status: 400 });
  }

  const file = form.get('audio');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Missing audio file field.' }, { status: 400 });
  }

  const languageField = form.get('language');
  if (typeof languageField === 'string' && languageField.trim()) {
    config.language = normalizeSpeechLocale(languageField.trim(), config.language);
  }

  const blob = file as File;
  if (blob.size <= 0) {
    return NextResponse.json({ error: 'Empty audio payload.' }, { status: 400 });
  }
  if (blob.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Audio too large (max 8 MB).' }, { status: 413 });
  }
  const mimeType = blob.type || 'audio/webm';
  const buffer = await blob.arrayBuffer();

  try {
    const result = await transcribeUpstream(buffer, mimeType, config);
    return NextResponse.json({
      text: result.text,
      confidence: result.confidence,
      language: result.language,
      provider: result.provider,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed.';
    console.error('[stt]', auth.userId, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Health / capability probe. */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`stt-health:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
  }
  const config = parseSttUpstreamConfig();
  return NextResponse.json({
    configured: !!config,
    provider: config?.provider ?? null,
  });
}
