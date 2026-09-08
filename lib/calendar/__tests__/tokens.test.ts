import { describe, expect, it, beforeAll } from 'vitest';
import {
  decryptToken,
  encryptToken,
  isTokenEncrypted,
} from '@/lib/calendar/tokens';

describe('calendar tokens - AES-256-GCM encryption', () => {
  beforeAll(() => {
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('round-trips a token', () => {
    const plaintext = 'secret-access-token-1234567890';
    const ciphertext = encryptToken(plaintext);
    expect(isTokenEncrypted(ciphertext)).toBe(true);
    expect(ciphertext.startsWith('enc:')).toBe(true);
    expect(decryptToken(ciphertext)).toBe(plaintext);
  });

  it('produces a different ciphertext for the same plaintext (random IV)', () => {
    const a = encryptToken('same-token');
    const b = encryptToken('same-token');
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(decryptToken(b));
  });

  it('passes legacy plaintext values through untouched', () => {
    expect(isTokenEncrypted('legacy-plaintext')).toBe(false);
    expect(decryptToken('legacy-plaintext')).toBe('legacy-plaintext');
  });

  it('rejects a tampered ciphertext', () => {
    const ciphertext = encryptToken('tamper-me');
    const tampered = ciphertext.slice(0, -2) + (ciphertext.endsWith('A') ? 'B' : 'A');
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('rejects missing/invalid keys with a clear error', () => {
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken('x')).toThrow(/CALENDAR_TOKEN_ENCRYPTION_KEY/);
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = 'tooshort';
    expect(() => encryptToken('x')).toThrow(/32 bytes/);
  });
});