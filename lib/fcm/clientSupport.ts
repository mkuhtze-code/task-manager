// Pure browser-capability evaluation for the FCM web push path. Kept free
// of any Firebase import so it is unit-testable in a plain Node vitest
// environment and usable by the registration layer in the browser.

export interface WebPushEnvironment {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
}

export type WebPushCapability =
  | { supported: true }
  | { supported: false; reason: 'no-service-worker' | 'no-push-manager' | 'no-notifications' };

// Capability checks are intentionally conservative: the absence of any one
// of the three primitive APIs means FCM web push cannot work, so we report
// unsupported rather than failing later with an opaque error.
export function evaluateWebPushSupport(env: WebPushEnvironment): WebPushCapability {
  if (!env.hasServiceWorker) return { supported: false, reason: 'no-service-worker' };
  if (!env.hasPushManager) return { supported: false, reason: 'no-push-manager' };
  if (!env.hasNotification) return { supported: false, reason: 'no-notifications' };
  return { supported: true };
}

export function getWebPushSupport(): WebPushCapability {
  return evaluateWebPushSupport({
    hasServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    hasPushManager: typeof window !== 'undefined' && 'PushManager' in window,
    hasNotification:
      typeof window !== 'undefined' &&
      typeof (window as { Notification?: unknown }).Notification !== 'undefined',
  });
}

export type GetTokenFailureReason =
  | 'missing-permission'
  | 'invalid-service-worker'
  | 'invalid-application-server-key'
  | 'token-unavailable';

// Maps the Firebase messaging getToken error surface onto narrow, stable
// reasons the registration layer can act on (Phase 9 failure handling).
export function classifyGetTokenError(err: unknown): GetTokenFailureReason {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code || '';
  if (message.includes('missing-app-config-values')) return 'missing-permission';
  if (code === 'messaging/permission-blocked' || message.includes('permission') || message.includes('Permission')) {
    return 'missing-permission';
  }
  if (code === 'messaging/invalid-registration-token' || code === 'messaging/invalid-service-worker') {
    return 'invalid-service-worker';
  }
  if (code === 'messaging/invalid-application-server-key') return 'invalid-application-server-key';
  return 'token-unavailable';
}