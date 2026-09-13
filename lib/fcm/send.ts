import crypto from 'node:crypto';

// Server-side FCM web push foundation.
//
// This is the isolated delivery seam for browser push: it maps a narrow,
// structured intent (title/body/destination/type/entityId) onto an FCM
// HTTP v1 message and sends it. It is deliberately NOT connected to any
// Dokkit notification events yet — this task establishes the delivery
// path, not the trigger.
//
// Configuration: FIREBASE_SERVICE_ACCOUNT_JSON (the raw contents of a
// Firebase service-account JSON file). When it is missing,
// sendWebPushNotification returns a typed `not_configured` result so the
// caller can degrade without breaking the rest of the application.
//
// The OAuth access-token minting is kept dependency-free on purpose
// (Node crypto + global fetch): the repo otherwise has no Firebase Admin
// dependency, and FCM v1 needs only a signed JWT + one REST call.

export interface WebPushMessage {
  token: string;
  title: string;
  body: string;
  destination?: string;
  type?: string;
  entityId?: string;
}

export type SendWebPushResult =
  | { ok: true }
  | { ok: false; code: 'not_configured' | 'auth_failed' | 'unregistered' | 'delivery_failed'; message: string };

// ── Payload construction ─────────────────────────────────────────
// The message is data-only on purpose: the browser Service Worker owns
// notification rendering via onBackgroundMessage, which prevents the
// double notification you get when 'notification' is present AND the SW
// shows one itself. dokkit_source marks these as FCM messages so the
// legacy web-push push handler in the SW skips them.

export function resolveWebPushDestination(destination: string | undefined, basePath = '/app'): string {
  if (!destination) return basePath;
  const d = String(destination).trim();
  if (!d) return basePath;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(d)) return basePath;
  if (d.startsWith(basePath)) return d;
  return d.startsWith('/') ? `${basePath}${d}` : `${basePath}/${d}`;
}

export function buildFcmMessage(msg: WebPushMessage): {
  message: { token: string; data: Record<string, string> };
} {
  const destination = resolveWebPushDestination(msg.destination);
  const data: Record<string, string> = {
    title: msg.title,
    body: msg.body,
    destination,
    dokkit_source: 'fcm',
  };
  if (msg.type) data.type = String(msg.type);
  if (msg.entityId) data.entityId = String(msg.entityId);

  return { message: { token: msg.token, data } };
}

// ── Service-account access token ──────────────────────────────────
// https://developers.google.com/identity/protocols/oauth2/service-account
// Minimal RS256 JWT assertion signed with the service-account PEM key,
// exchanged for a short-lived OAuth access token (cached until expiry).

export interface FirebaseServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

export function parseServiceAccount(json: string | undefined): FirebaseServiceAccount | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
      return null;
    }
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
      project_id: typeof parsed.project_id === 'string' ? parsed.project_id : '',
    };
  } catch {
    return null;
  }
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64url');
}

export function signRsaSha256(input: string, privateKeyPem: string): string {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(input);
  return signer.sign(privateKeyPem, 'base64');
}

export function buildJwtAssertion(
  account: FirebaseServiceAccount,
  nowSec: number,
  signer: (input: string, privateKeyPem: string) => string = signRsaSha256
): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const iat = nowSec - 30;
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat,
      exp: iat + 3600,
    })
  );
  const signingInput = `${header}.${claim}`;
  return `${signingInput}.${base64UrlEncode(signer(signingInput, account.private_key))}`;
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SEND_URL = 'https://fcm.googleapis.com/v1/projects/{projectId}/messages:send';

interface CachedAccessToken {
  access_token: string;
  expiresAtSec: number;
}

const accessTokenCache = new Map<string, CachedAccessToken>();

export async function getFcmAccessToken(
  account: FirebaseServiceAccount,
  fetchImpl: typeof fetch = fetch,
  signer: (input: string, privateKeyPem: string) => string = signRsaSha256
): Promise<string> {
  const cached = accessTokenCache.get(account.client_email);
  const nowSec = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAtSec > nowSec + 60) return cached.access_token;

  const assertion = buildJwtAssertion(account, nowSec, signer);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OAuth token request failed (${res.status}) ${text.slice(0, 200)}`);
  }
  const parsed = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!parsed.access_token) throw new Error('OAuth token response missing access_token');

  const expiresIn = typeof parsed.expires_in === 'number' ? parsed.expires_in : 3600;
  accessTokenCache.set(account.client_email, {
    access_token: parsed.access_token,
    expiresAtSec: nowSec + expiresIn,
  });
  return parsed.access_token;
}

// ── Send ─────────────────────────────────────────────────────────

export interface SendDeps {
  fetchImpl?: typeof fetch;
  nowProvider?: () => number;
  signer?: (input: string, privateKeyPem: string) => string;
}

export async function sendWebPushNotification(
  message: WebPushMessage,
  deps: SendDeps = {}
): Promise<SendWebPushResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const signer = deps.signer ?? signRsaSha256;

  const account = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!account) {
    return {
      ok: false,
      code: 'not_configured',
      message: 'FIREBASE_SERVICE_ACCOUNT_JSON is not configured',
    };
  }

  let accessToken: string;
  try {
    accessToken = await getFcmAccessToken(account, fetchImpl, signer);
  } catch (err) {
    return { ok: false, code: 'auth_failed', message: String(err) };
  }

  const projectId = account.project_id || account.client_email.split('@')[0] || '';
  const url = FCM_SEND_URL.replace('{projectId}', projectId);
  const payload = buildFcmMessage(message);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { ok: false, code: 'delivery_failed', message: `Network error sending FCM message: ${String(err)}` };
  }

  if (res.ok) return { ok: true };

  const bodyText = await res.text().catch(() => '');
  if (isUnregisteredResponse(res.status, bodyText)) {
    return { ok: false, code: 'unregistered', message: 'FCM token is no longer valid' };
  }
  return { ok: false, code: 'delivery_failed', message: `FCM send failed (${res.status}) ${bodyText.slice(0, 200)}` };
}

export function isUnregisteredResponse(status: number, body: string): boolean {
  if (status === 404 || status === 410) return true;
  if (status >= 400) {
    return (
      body.includes('UNREGISTERED') ||
      body.includes('SENDER_ID_MISMATCH') ||
      body.includes('"NOT_FOUND"') ||
      body.includes('registration token is not a valid')
    );
  }
  return false;
}