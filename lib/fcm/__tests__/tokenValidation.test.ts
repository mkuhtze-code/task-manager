import { describe, it, expect } from 'vitest';
import { isValidFcmToken, normalizeFcmToken, sanitizeUserAgent } from '../tokenValidation';

const VALID = 'cXtGXxKZQzMYJ4DOHlAOjBIL9X5GPZ17huWACHdRc-Tq2o4VF4Nxw1cbqJZa4ebP:APA91bFJzVXpYHib9PjY6m_XuFvcWvYFnZ2ozc9gfWMXvQ5sYHd3hqH8Ssy_Z7y2nKQbpwfPmq3dHxByfLa0C7Q6nUezBtm9Y2rL4kP7Nq5u9o1WrA0SvCxJfE';

describe('isValidFcmToken', () => {
  it('accepts a realistic FCM registration token', () => {
    expect(isValidFcmToken(VALID)).toBe(true);
  });

  it('rejects non-string values', () => {
    expect(isValidFcmToken(null)).toBe(false);
    expect(isValidFcmToken(undefined)).toBe(false);
    expect(isValidFcmToken(12345)).toBe(false);
    expect(isValidFcmToken({})).toBe(false);
    expect(isValidFcmToken(['x'])).toBe(false);
  });

  it('rejects tokens that are too short (cannot be a real FCM token)', () => {
    expect(isValidFcmToken('short')).toBe(false);
    expect(isValidFcmToken('x'.repeat(20))).toBe(false);
    expect(isValidFcmToken('x'.repeat(63))).toBe(false);
  });

  it('accepts a bare token of minimum plausible length', () => {
    expect(isValidFcmToken('x'.repeat(64))).toBe(true);
  });

  it('rejects characters that never appear in FCM tokens', () => {
    expect(isValidFcmToken(`${VALID} `)).toBe(false); // trailing whitespace
    expect(isValidFcmToken(`a${'?'.repeat(200)}b`)).toBe(false);
    expect(isValidFcmToken(`a${'/'.repeat(200)}b`)).toBe(false);
    expect(isValidFcmToken(`a${'\n'.repeat(200)}b`)).toBe(false);
  });

  it('rejects absurdly long input', () => {
    expect(isValidFcmToken('a'.repeat(5000))).toBe(false);
  });
});

describe('normalizeFcmToken', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeFcmToken(`  ${VALID}  `)).toBe(VALID);
  });

  it('returns null for invalid tokens', () => {
    expect(normalizeFcmToken('')).toBe(null);
    expect(normalizeFcmToken(null)).toBe(null);
  });
});

describe('sanitizeUserAgent', () => {
  it('keeps a normal user agent', () => {
    expect(sanitizeUserAgent('Mozilla/5.0 (X11; Linux x86_64) FooBar/1.0')).toBe(
      'Mozilla/5.0 (X11; Linux x86_64) FooBar/1.0'
    );
  });

  it('returns null for empty or missing user agents', () => {
    expect(sanitizeUserAgent(null)).toBe(null);
    expect(sanitizeUserAgent(undefined)).toBe(null);
    expect(sanitizeUserAgent('')).toBe(null);
    expect(sanitizeUserAgent('   ')).toBe(null);
  });

  it('caps absurdly long user agents', () => {
    expect(sanitizeUserAgent('a'.repeat(4096))).toBe(null);
  });
});