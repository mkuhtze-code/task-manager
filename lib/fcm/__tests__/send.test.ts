import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  sendWebPushNotification,
  buildFcmMessage,
  resolveWebPushDestination,
  buildJwtAssertion,
  parseServiceAccount,
  signRsaSha256,
} from '../send';

const SERVICE_ACCOUNT = {
  client_email: 'dokkit-fcm@example-project.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nMII_\n-----END PRIVATE KEY-----\n',
  project_id: 'dokkit-fcm-project',
};

// A valid signer isn't needed for the fetch-level tests, only a
// deterministic one so the JWT shape stays stable.
const STUB_SIGNER = () => 'SIGNATURE';

const TOKEN_A = 'cXtGXxKZQzMYJ4DOHlAOjBIL9X5GPZ17huWACHdRc-Tq2o4VF4Nxw1cbqJZa4ebP:APA91bFJzVXpYHib9PjY6m_XuFvcWvYFnZ2ozc9gfWMXvQ5sYHd3hqH8Ssy_Z7y2nKQbpwfPmq3dHxByfLa0C7Q6nUezBtm9Y2rL4kP7Nq5u9o1WrA0SvCxJfE';

function fakeFetchHandler(options: {
  tokenResponse?: { status?: number; body?: string };
  sendResponse: { status: number; body?: string };
}) {
  return async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('oauth2.googleapis.com/token')) {
      const status = options.tokenResponse?.status ?? 200;
      const body =
        options.tokenResponse?.body ??
        JSON.stringify({ access_token: 'fake-access-token', expires_in: 3600 });
      return new Response(body, { status });
    }
    if (u.includes('fcm.googleapis.com/v1/projects/')) {
      return new Response(options.sendResponse.body ?? '{}', { status: options.sendResponse.status });
    }
    throw new Error(`Unexpected URL: ${u}`);
  };
}

describe('resolveWebPushDestination', () => {
  it('defaults to the app base path', () => {
    expect(resolveWebPushDestination(undefined)).toBe('/app');
    expect(resolveWebPushDestination('')).toBe('/app');
  });

  it('normalizes a relative path under the /app base path', () => {
    expect(resolveWebPushDestination('/jobs/123')).toBe('/app/jobs/123');
    expect(resolveWebPushDestination('meetings/123')).toBe('/app/meetings/123');
  });

  it('preserves an already-prefixed path', () => {
    expect(resolveWebPushDestination('/app/travel/123')).toBe('/app/travel/123');
  });

  it('refuses absolute URLs (no hostname assumptions server-side)', () => {
    expect(resolveWebPushDestination('https://evil.example/x')).toBe('/app');
    expect(resolveWebPushDestination('//evil.example/x')).toBe('/app');
    expect(resolveWebPushDestination('javascript:alert(1)')).toBe('/app');
  });
});

describe('buildFcmMessage', () => {
  it('builds a data-only message carrying the FCM marker and structured intent', () => {
    const out = buildFcmMessage({
      token: TOKEN_A,
      title: 'Job overdue',
      body: 'Fixing the flashing is overdue.',
      destination: '/jobs/123',
      type: 'task',
      entityId: 'abc-123',
    });
    expect(out.message.token).toBe(TOKEN_A);
    // Data-only by design: FCM must not auto-render, or the Service
    // Worker's onBackgroundMessage would double the notification.
    expect(Object.keys(out.message)).toEqual(['token', 'data']);
    expect(out.message.data).toEqual({
      title: 'Job overdue',
      body: 'Fixing the flashing is overdue.',
      destination: '/app/jobs/123',
      dokkit_source: 'fcm',
      type: 'task',
      entityId: 'abc-123',
    });
  });

  it('coerces numbers to strings (FCM data payloads are string maps)', () => {
    const out = buildFcmMessage({ token: TOKEN_A, title: 'x', body: 'y', entityId: 42 as any });
    expect(out.message.data.entityId).toBe('42');
  });
});

describe('parseServiceAccount & buildJwtAssertion', () => {
  it('parses a service-account JSON string', () => {
    const sa = parseServiceAccount(JSON.stringify(SERVICE_ACCOUNT));
    expect(sa).toEqual(SERVICE_ACCOUNT);
  });

  it('returns null for missing or malformed config', () => {
    expect(parseServiceAccount(undefined)).toBe(null);
    expect(parseServiceAccount('not json')).toBe(null);
    expect(parseServiceAccount(JSON.stringify({ foo: 1 }))).toBe(null);
  });

  it('produces a three-part RS256 assertion with the right claims', () => {
    const jwt = buildJwtAssertion(SERVICE_ACCOUNT, 1_700_000_000, () => 'SIGNATURE');
    const parts = jwt.split('.');
    expect(parts).toHaveLength(3);

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
    const claim = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(claim.iss).toBe(SERVICE_ACCOUNT.client_email);
    expect(claim.aud).toBe('https://oauth2.googleapis.com/token');
    expect(claim.scope).toBe('https://www.googleapis.com/auth/firebase.messaging');
    expect(claim.iat).toBe(1_699_999_970);
    expect(claim.exp).toBe(claim.iat + 3600);
  });

  it('signs with real RSA-SHA256 crypto using a real service-account key', () => {
    // Smoke test against a truly generated RSA key: the assertion must be
    // verifyable with the matching public key.
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const key = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const cert = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const token = 'signed-data';
    const signature = signRsaSha256(token, key);

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(token);
    verifier.end();
    expect(verifier.verify(cert, signature, 'base64')).toBe(true);
  });
});

describe('sendWebPushNotification', () => {
  beforeEach(() => {
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT_JSON', JSON.stringify(SERVICE_ACCOUNT));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns not_configured when no service account is provided', async () => {
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT_JSON', '');
    const result = await sendWebPushNotification({ token: TOKEN_A, title: 'x', body: 'y' });
    expect(result).toMatchObject({ ok: false, code: 'not_configured' });
  });

  it('sends a successful FCM v1 message', async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const u = String(url);
      calls.push({ url: u, body: typeof init?.body === 'string' ? init.body : undefined });
      if (u.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }));
      }
      return new Response('{}', { status: 200 });
    };

    const result = await sendWebPushNotification(
      { token: TOKEN_A, title: 'T', body: 'B', destination: '/meetings/9' },
      { fetchImpl, signer: STUB_SIGNER }
    );
    expect(result).toEqual({ ok: true });

    const sendCall = calls.find((c) => c.url.includes('fcm.googleapis.com'));
    expect(sendCall).toBeTruthy();
    expect(sendCall!.url).toContain('/v1/projects/dokkit-fcm-project/messages:send');
    const payload = JSON.parse(sendCall!.body!);
    expect(payload.message.token).toBe(TOKEN_A);
    expect(payload.message.data.destination).toBe('/app/meetings/9');
    expect(payload.message.data.dokkit_source).toBe('fcm');
  });

  it('maps a 404 to unregistered (token no longer valid)', async () => {
    const fetchImpl = fakeFetchHandler({ tokenResponse: { status: 200 }, sendResponse: { status: 404 } });
    const result = await sendWebPushNotification(
      { token: TOKEN_A, title: 'x', body: 'y' },
      { fetchImpl, signer: STUB_SIGNER }
    );
    expect(result).toMatchObject({ ok: false, code: 'unregistered' });
  });

  it('maps an UNREGISTERED error body to unregistered', async () => {
    const fetchImpl = fakeFetchHandler({
      tokenResponse: { status: 200 },
      sendResponse: { status: 400, body: JSON.stringify({ error: { status: 'UNREGISTERED' } }) },
    });
    const result = await sendWebPushNotification(
      { token: TOKEN_A, title: 'x', body: 'y' },
      { fetchImpl, signer: STUB_SIGNER }
    );
    expect(result).toMatchObject({ ok: false, code: 'unregistered' });
  });

  it('maps a server error to delivery_failed', async () => {
    const fetchImpl = fakeFetchHandler({ tokenResponse: { status: 200 }, sendResponse: { status: 500, body: 'boom' } });
    const result = await sendWebPushNotification(
      { token: TOKEN_A, title: 'x', body: 'y' },
      { fetchImpl, signer: STUB_SIGNER }
    );
    expect(result).toMatchObject({ ok: false, code: 'delivery_failed' });
  });

  it('maps a network failure during sending to delivery_failed', async () => {
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).includes('oauth2.googleapis.com')) {
        return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }));
      }
      throw new Error('socket hang up');
    };
    const result = await sendWebPushNotification(
      { token: TOKEN_A, title: 'x', body: 'y' },
      { fetchImpl, signer: STUB_SIGNER }
    );
    expect(result).toMatchObject({ ok: false, code: 'delivery_failed' });
  });

  it('maps an OAuth failure to auth_failed', async () => {
    const otherAccount = {
      ...SERVICE_ACCOUNT,
      client_email: 'other-account@example-project.iam.gserviceaccount.com',
      project_id: 'other-project',
    };
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT_JSON', JSON.stringify(otherAccount));
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).includes('oauth2.googleapis.com')) {
        return new Response('denied', { status: 401 });
      }
      return new Response('{}', { status: 200 });
    };
    const result = await sendWebPushNotification(
      { token: TOKEN_A, title: 'x', body: 'y' },
      { fetchImpl, signer: STUB_SIGNER }
    );
    expect(result).toMatchObject({ ok: false, code: 'auth_failed' });
  });
});