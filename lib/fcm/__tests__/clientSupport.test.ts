import { describe, it, expect } from 'vitest';
import { evaluateWebPushSupport, classifyGetTokenError } from '../clientSupport';

describe('evaluateWebPushSupport', () => {
  it('reports supported when all primitives exist', () => {
    expect(
      evaluateWebPushSupport({ hasServiceWorker: true, hasPushManager: true, hasNotification: true })
    ).toEqual({ supported: true });
  });

  it('reports unsupported when every API is missing', () => {
    expect(
      evaluateWebPushSupport({ hasServiceWorker: false, hasPushManager: false, hasNotification: false })
    ).toEqual({ supported: false, reason: 'no-service-worker' });
  });

  it('reports the specific missing primitive reason', () => {
    expect(
      evaluateWebPushSupport({ hasServiceWorker: true, hasPushManager: false, hasNotification: true })
    ).toEqual({ supported: false, reason: 'no-push-manager' });

    expect(
      evaluateWebPushSupport({ hasServiceWorker: true, hasPushManager: true, hasNotification: false })
    ).toEqual({ supported: false, reason: 'no-notifications' });
  });
});

describe('classifyGetTokenError', () => {
  it('classifies permission failures', () => {
    expect(classifyGetTokenError(new Error('messaging/permission-blocked'))).toBe('missing-permission');
    expect(classifyGetTokenError(new Error('Permission denied'))).toBe('missing-permission');
    expect(classifyGetTokenError({ code: 'messaging/permission-blocked' })).toBe('missing-permission');
  });

  it('classifies service-worker failures', () => {
    expect(classifyGetTokenError({ code: 'messaging/invalid-registration-token' })).toBe(
      'invalid-service-worker'
    );
    expect(classifyGetTokenError({ code: 'messaging/invalid-service-worker' })).toBe(
      'invalid-service-worker'
    );
  });

  it('classifies an invalid application-server (VAPID) key', () => {
    expect(classifyGetTokenError({ code: 'messaging/invalid-application-server-key' })).toBe(
      'invalid-application-server-key'
    );
  });

  it('falls back to token-unavailable for anything else', () => {
    expect(classifyGetTokenError(undefined)).toBe('token-unavailable');
    expect(classifyGetTokenError(new Error('some other thing'))).toBe('token-unavailable');
    expect(classifyGetTokenError({ code: 'unknown' })).toBe('token-unavailable');
  });
});