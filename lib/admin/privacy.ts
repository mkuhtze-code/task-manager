// Privacy helpers for Admin surfaces. Prefer minimisation: mask identifiers
// in feeds and overviews; show full emails only on the Users screen (an
// intentional, audited account-admin tool).

const SENSITIVE_CONTEXT_KEYS = new Set([
  'authorization',
  'Authorization',
  'token',
  'access_token',
  'refresh_token',
  'password',
  'secret',
  'apiKey',
  'api_key',
  'service_role',
  'private_key',
  'vapid',
  'cookie',
  'Cookie',
]);

/** Mask an email for display outside the Users admin tool. */
export function maskEmail(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') return 'a user';
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return 'a user';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!domain) return 'a user';
  const visible = local.length <= 1 ? local : local[0];
  return `${visible}***@${domain}`;
}

/** True when a string looks like it might be an email. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Strip secrets from error context before it is written to error_logs.
 * Keeps structure for debugging without persisting tokens or credentials.
 */
export function sanitizeErrorContext(
  context: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!context || typeof context !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_CONTEXT_KEYS.has(key) || /token|secret|password|authorization|cookie|key/i.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    if (typeof value === 'string' && value.length > 500) {
      out[key] = `${value.slice(0, 500)}…`;
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = sanitizeErrorContext(value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}
