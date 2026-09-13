import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken } from 'firebase/messaging';
import { authedFetch } from '@/lib/authedFetch';
import { getFirebaseWebConfig, getFirebaseVapidKey, FirebaseWebConfig } from '@/lib/fcm/config';
import { getWebPushSupport, classifyGetTokenError } from '@/lib/fcm/clientSupport';

// Browser-side FCM registration layer.
//
// Nothing here runs automatically: Dokkit must explicitly request
// notification permission, so the app calls registerWebPushSubscription()
// when the user opts in (the Preferences screen is the eventual call
// site). All failure modes return typed reasons instead of throwing, so a
// notification hiccup can never break the surrounding UI.

const SERVICE_WORKER_URL = '/app/sw.js';
const SERVICE_WORKER_SCOPE = '/app/';

export type WebPushPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export type WebPushRegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: string; error?: string };

export type RegisterTokenResult = { ok: true } | { ok: false; error: string };

function ensureFirebaseApp(cfg: FirebaseWebConfig): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(cfg);
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Registers an already-obtained FCM token against the authenticated
// Dokkit account. Exposed separately so the token-refresh handler can
// re-register a rotated token without re-prompting for permission.
export async function registerWebPushToken(
  token: string,
  opts?: { userAgent?: string }
): Promise<RegisterTokenResult> {
  const userAgent = opts?.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : null);
  try {
    const res: any = await authedFetch('/api/fcm-token', { token, platform: 'web', userAgent });
    if (res && res.ok) return { ok: true };
    return { ok: false, error: res?.error || 'Could not register this device for notifications.' };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

// Requests notification permission. Only call from explicit user intent.
export async function requestPushPermission(): Promise<WebPushPermission> {
  if (!getWebPushSupport().supported) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

// Full opt-in flow: capability check → permission → service worker
// registration → FCM token → authenticated Dokkit API registration.
export async function registerWebPushSubscription(): Promise<WebPushRegistrationResult> {
  const support = getWebPushSupport();
  if (!support.supported) return { ok: false, reason: support.reason };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'permission-denied' };
  } catch (err) {
    return { ok: false, reason: 'permission-denied', error: toMessage(err) };
  }

  const firebaseConfig = getFirebaseWebConfig();
  const vapidKey = getFirebaseVapidKey();
  if (!firebaseConfig || !vapidKey) return { ok: false, reason: 'firebase-not-configured' };

  try {
    let registration: ServiceWorkerRegistration;
    try {
      registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
        scope: SERVICE_WORKER_SCOPE,
      });
      await navigator.serviceWorker.ready;
    } catch (err) {
      return { ok: false, reason: 'service-worker-unavailable', error: toMessage(err) };
    }

    const messaging = getMessaging(ensureFirebaseApp(firebaseConfig));

    let token: string;
    try {
      token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      });
    } catch (err) {
      return { ok: false, reason: classifyGetTokenError(err), error: toMessage(err) };
    }
    if (!token) return { ok: false, reason: 'token-unavailable' };

    const api = await registerWebPushToken(token);
    if (!api.ok) return { ok: false, reason: 'api-error', error: api.error };

    return { ok: true, token };
  } catch (err) {
    return { ok: false, reason: 'token-unavailable', error: toMessage(err) };
  }
}

// Polls the Firebase SDK for FCM token rotation and re-registers each new
// token against Dokkit. firebase/messaging no longer exposes a browser-side
// onTokenRefresh callback (it moved to the service-worker entry), so this
// watches getToken() results instead: the SDK only returns a *different*
// token after it has rotated the underlying subscription, which is exactly
// the case we need to re-register. Returns an unsubscribe function.
// Best-effort: a failed check or re-registration is silently skipped and
// never throws into the app.
const TOKEN_REFRESH_CHECK_MS = 5 * 60 * 1000;

export function watchWebPushTokenRefresh(onNewToken: (token: string) => void): () => void {
  if (!getWebPushSupport().supported) return () => {};
  const firebaseConfig = getFirebaseWebConfig();
  const vapidKey = getFirebaseVapidKey();
  if (!firebaseConfig || !vapidKey) return () => {};

  let lastRegistered: string | null = null;
  let stopped = false;

  const check = async () => {
    if (stopped) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const messaging = getMessaging(ensureFirebaseApp(firebaseConfig));
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      });
      if (!token || token === lastRegistered) return;
      await registerWebPushToken(token);
      lastRegistered = token;
      onNewToken(token);
    } catch {
      // A rotated token that fails to re-register is surfaced to the
      // caller rather than thrown into the app.
    }
  };

  void check();
  const timer = setInterval(check, TOKEN_REFRESH_CHECK_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}