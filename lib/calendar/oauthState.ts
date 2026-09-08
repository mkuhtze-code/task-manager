import { randomBytes, timingSafeEqual } from 'crypto';

export const OAUTH_STATE_COOKIE = 'dokkit_oauth_state';
export const OAUTH_USER_COOKIE = 'dokkit_oauth_user';
export const OAUTH_STATE_MAX_AGE_SECONDS = 600;

export type OAuthStateVerdict =
  | 'ok'
  | 'missing_state'
  | 'invalid_state'
  | 'expired_state'
  | 'missing_user';

export interface OAuthCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
}

export function oauthCookieOptions(): OAuthCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/app/api/auth/microsoft',
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  };
}

export function generateOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

export function encodeOAuthStateCookie(state: string, iat = Date.now()): string {
  return `${iat}.${state}`;
}

export function parseOAuthStateCookie(
  cookieValue: string | null | undefined
): { iat: number; token: string } | null {
  if (!cookieValue) {
    return null;
  }
  const dot = cookieValue.indexOf('.');
  if (dot <= 0 || dot === cookieValue.length - 1) {
    return null;
  }
  const iat = Number(cookieValue.slice(0, dot));
  const token = cookieValue.slice(dot + 1);
  if (!Number.isFinite(iat) || token.length === 0) {
    return null;
  }
  return { iat, token };
}

export function verifyOAuthState(
  cookieValue: string | null | undefined,
  stateParam: string | null | undefined,
  now = Date.now(),
  maxAgeSeconds = OAUTH_STATE_MAX_AGE_SECONDS
): OAuthStateVerdict {
  const parsed = parseOAuthStateCookie(cookieValue);
  if (!parsed) {
    return 'missing_state';
  }
  const ageMs = now - parsed.iat;
  if (Number.isNaN(ageMs) || ageMs < 0 || ageMs > maxAgeSeconds * 1000) {
    return 'expired_state';
  }
  if (!stateParam) {
    return 'missing_state';
  }
  const a = Buffer.from(parsed.token, 'utf8');
  const b = Buffer.from(stateParam, 'utf8');
  if (a.length !== b.length) {
    return 'invalid_state';
  }
  return timingSafeEqual(a, b) ? 'ok' : 'invalid_state';
}

export function isExpiredState(
  cookieValue: string | null | undefined,
  now = Date.now(),
  maxAgeSeconds = OAUTH_STATE_MAX_AGE_SECONDS
): boolean {
  const parsed = parseOAuthStateCookie(cookieValue);
  if (!parsed) {
    return true;
  }
  const ageMs = now - parsed.iat;
  return Number.isNaN(ageMs) || ageMs < 0 || ageMs > maxAgeSeconds * 1000;
}