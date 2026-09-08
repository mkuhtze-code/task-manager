import { describe, expect, it } from 'vitest';
import {
  OAUTH_STATE_MAX_AGE_SECONDS,
  encodeOAuthStateCookie,
  generateOAuthState,
  oauthCookieOptions,
  parseOAuthStateCookie,
  verifyOAuthState,
} from '@/lib/calendar/oauthState';
describe('calendar OAuth state - generation and cookies', () => {
  it('generates a unique, reasonably long state', () => {
    const a = generateOAuthState();
    const b = generateOAuthState();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it('encodes/decodes the cookie as iat.state', () => {
    const state = generateOAuthState();
    const cookie = encodeOAuthStateCookie(state, 12345);
    expect(parseOAuthStateCookie(cookie)).toEqual({ iat: 12345, token: state });
  });

  it('rejects malformed cookies', () => {
    expect(parseOAuthStateCookie(null)).toBeNull();
    expect(parseOAuthStateCookie('')).toBeNull();
    expect(parseOAuthStateCookie('noidot')).toBeNull();
    expect(parseOAuthStateCookie('.token')).toBeNull();
    expect(parseOAuthStateCookie('123.')).toBeNull();
    expect(parseOAuthStateCookie('abc.token')).toBeNull();
  });

  it('scopes cookies to the OAuth path and 10 minute lifetime', () => {
    const opts = oauthCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/app/api/auth/microsoft');
    expect(opts.maxAge).toBe(OAUTH_STATE_MAX_AGE_SECONDS);
  });
});

describe('calendar OAuth state - verification', () => {
  it('verifies a matching, fresh state', () => {
    const state = generateOAuthState();
    const cookie = encodeOAuthStateCookie(state);
    expect(verifyOAuthState(cookie, state)).toBe('ok');
  });

  it('rejects a missing cookie', () => {
    const state = generateOAuthState();
    expect(verifyOAuthState(null, state)).toBe('missing_state');
    expect(verifyOAuthState(undefined, state)).toBe('missing_state');
  });

  it('rejects a missing state parameter', () => {
    const cookie = encodeOAuthStateCookie(generateOAuthState());
    expect(verifyOAuthState(cookie, null)).toBe('missing_state');
  });

  it('rejects a mismatched state (CSRF / replay)', () => {
    const cookie = encodeOAuthStateCookie(generateOAuthState());
    expect(verifyOAuthState(cookie, generateOAuthState())).toBe('invalid_state');
  });

  it('rejects an expired state even with a valid token', () => {
    const state = generateOAuthState();
    const now = Date.now();
    const stale = encodeOAuthStateCookie(state, now - OAUTH_STATE_MAX_AGE_SECONDS * 1000 - 1);
    expect(verifyOAuthState(stale, state, now)).toBe('expired_state');
  });

  it('accepts a state at the edge of its lifetime', () => {
    const state = generateOAuthState();
    const now = Date.now();
    const cookie = encodeOAuthStateCookie(state, now - OAUTH_STATE_MAX_AGE_SECONDS * 1000);
    expect(verifyOAuthState(cookie, state, now)).toBe('ok');
  });

  it('rejects future-dated states', () => {
    const state = generateOAuthState();
    const cookie = encodeOAuthStateCookie(state, Date.now() + 60_000);
    expect(verifyOAuthState(cookie, state)).toBe('expired_state');
  });
});