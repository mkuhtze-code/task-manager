// FCM registration-token validation. Tokens are issued by the Firebase
// Messaging SDK (`getToken`) and are long opaque strings (a Sentry-IDs
// lookalike: base64url characters separated by ':'); we only enforce sane
// length/character rules and never interpret token contents.

const FCM_TOKEN_MIN_LENGTH = 64;
const FCM_TOKEN_MAX_LENGTH = 4096;
const VALID_TOKEN_CHARS = /^[A-Za-z0-9_\-:]+$/;

export function isValidFcmToken(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  return (
    token.length >= FCM_TOKEN_MIN_LENGTH &&
    token.length <= FCM_TOKEN_MAX_LENGTH &&
    VALID_TOKEN_CHARS.test(token)
  );
}

export function normalizeFcmToken(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const trimmed = token.trim();
  return isValidFcmToken(trimmed) ? trimmed : null;
}

export function sanitizeUserAgent(userAgent: unknown): string | null {
  if (typeof userAgent !== 'string') return null;
  const trimmed = userAgent.trim();
  if (!trimmed || trimmed.length > 1024) return null;
  return trimmed;
}