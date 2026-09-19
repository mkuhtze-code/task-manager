import crypto from 'node:crypto';

// Server-side FCM web push foundation.

export interface WebPushMessage {
  token: string;
  title: string;
  body: string;
  destination?: string;
  type?: string;
  entityId?: string;
  /** When true, SW shows the notification without sound/vibration. */
  silent?: boolean;
  /** Active-timer fields (for closed-app ongoing notification). */
  startedAt?: string;
  estimateMins?: number;
  loggedMins?: number;
  text?: string;
}

export type SendWebPushResult =
  | { ok: true }
  | { ok: false; code: 'not_configured' | 'auth_failed' | 'unregistered' | 'delivery_failed'; message: string };

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
  if (msg.silent) data.silent = '1';
  if (msg.startedAt) data.startedAt = String(msg.startedAt);
  if (msg.estimateMins != null) data.estimateMins = String(msg.estimateMins);
  if (msg.loggedMins != null) data.loggedMins = String(msg.loggedMins);
  if (msg.text) data.text = String(msg.text);

  return { message: { token: msg.token, data } };
}

export interface FirebaseServiceAccount {
  project_id?: string;
  client_email: string;
  private_key: string;
}

export function parseServiceAccount(json: string | undefined): FirebaseServiceAccount | null {
  if (!json || !json.trim()) return null;
  try {
    const parsed = JSON.parse(json) as FirebaseServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function signRsaSha256(input: string, privateKeyPem: string): string {
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(input);
  sign.end();
  return sign.sign(privateKeyPem, 'base64url');
}

function base64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

export function buildJwtAssertion(
  account: FirebaseServiceAccount,
  nowSec: number,
  signer: (input: string, privateKeyPem: string) => string = signRsaSha256
): string {
  const header = base64urlJson({ alg: 'RS256', typ: 'JWT' });
  const claim = base64urlJson({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  });
  const unsigned = `${header}.${claim}`;
  const sig = signer(unsigned, account.private_key);
  return `${unsigned}.${sig}`;
}

let cachedToken: { token: string; exp: number } | null = null;

export async function getFcmAccessToken(
  account: FirebaseServiceAccount,
  fetchImpl: typeof fetch = fetch,
  signer: (input: string, privateKeyPem: string) => string = signRsaSha256,
  nowProvider: () => number = () => Math.floor(Date.now() / 1000)
): Promise<string> {
  const now = nowProvider();
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token;

  const assertion = buildJwtAssertion(account, now, signer);
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Failed to mint FCM access token (${res.status}): ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('FCM token response missing access_token');
  const exp = now + (typeof json.expires_in === 'number' ? json.expires_in : 3600);
  cachedToken = { token: json.access_token, exp };
  return json.access_token;
}

const FCM_SEND_URL =
  'https://fcm.googleapis.com/v1/projects/{projectId}/messages:send';

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
