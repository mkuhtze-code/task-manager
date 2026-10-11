#!/usr/bin/env node

/**
 * Public, read-only production probe for GET /api/stt.
 *
 * Usage:
 *   DOKKIT_PRODUCTION_URL=https://www.dokkit.space npm run test:stt-production
 *   EXPECTED_STT_PROVIDER=deepgram DOKKIT_PRODUCTION_URL=https://www.dokkit.space npm run test:stt-production
 *
 * This checks configuration visibility only; it does not upload audio, test
 * credentials against the provider, or establish transcription quality.
 */
const rawBase = process.env.DOKKIT_PRODUCTION_URL?.trim();
if (!rawBase) {
  console.error('Missing DOKKIT_PRODUCTION_URL (for example https://www.dokkit.space).');
  process.exit(2);
}

let base;
try {
  base = new URL(rawBase);
} catch {
  console.error('DOKKIT_PRODUCTION_URL must be a valid absolute URL.');
  process.exit(2);
}

if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') {
  console.error('Use HTTPS for production probes.');
  process.exit(2);
}

base.pathname = base.pathname.replace(/\/$/, '');
base.search = '';
base.hash = '';
const endpoint = new URL(`${base.pathname}/api/stt`, base.origin);

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 8_000);

try {
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal: controller.signal,
  });

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    console.error(`STT probe returned non-JSON content (HTTP ${response.status}). Check the URL and deployment protection.`);
    process.exitCode = 1;
  } else {
    const body = await response.json();
    const allowedKeys = new Set(['configured', 'provider']);
    const safeShape =
      body !== null &&
      typeof body === 'object' &&
      typeof body.configured === 'boolean' &&
      (body.provider === null || ['deepgram', 'openai', 'generic'].includes(body.provider)) &&
      Object.keys(body).every((key) => allowedKeys.has(key));

    if (!response.ok || !safeShape) {
      console.error(`STT probe failed schema/status validation (HTTP ${response.status}).`);
      process.exitCode = 1;
    } else if (!body.configured || !body.provider) {
      console.error('Cloud STT is NOT configured. Set the server-side provider key and provider in Vercel.');
      console.log(JSON.stringify({ configured: body.configured, provider: body.provider }));
      process.exitCode = 1;
    } else if (
      process.env.EXPECTED_STT_PROVIDER &&
      body.provider !== process.env.EXPECTED_STT_PROVIDER.trim().toLowerCase()
    ) {
      console.error(`Provider mismatch: expected ${process.env.EXPECTED_STT_PROVIDER.trim().toLowerCase()}, received ${body.provider}.`);
      process.exitCode = 1;
    } else {
      console.log(`STT configuration probe passed: configured=true, provider=${body.provider}.`);
      console.log('This does not test provider credentials, audio transcription, auth, or real-device fallback.');
    }
  }
} catch (error) {
  const timedOut = error instanceof Error && error.name === 'AbortError';
  console.error(timedOut
    ? 'STT probe timed out after 8 seconds.'
    : 'Could not reach the STT probe endpoint. Check the deployment URL/network.');
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
