import { describe, expect, it } from 'vitest';
import { maskEmail, sanitizeErrorContext } from '@/lib/admin/privacy';

describe('maskEmail', () => {
  it('masks the local part', () => {
    expect(maskEmail('jane@example.com')).toBe('j***@example.com');
  });

  it('handles missing email', () => {
    expect(maskEmail(null)).toBe('a user');
    expect(maskEmail(undefined)).toBe('a user');
    expect(maskEmail('')).toBe('a user');
  });
});

describe('sanitizeErrorContext', () => {
  it('redacts token-like keys', () => {
    const out = sanitizeErrorContext({
      userId: 'abc',
      access_token: 'secret',
      nested: { authorization: 'Bearer x' },
    });
    expect(out).toEqual({
      userId: 'abc',
      access_token: '[redacted]',
      nested: { authorization: '[redacted]' },
    });
  });
});
