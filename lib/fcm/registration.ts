import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { normalizeFcmToken, sanitizeUserAgent } from '@/lib/fcm/tokenValidation';

// Account-scoped FCM web registration store. The data model is the
// existing Dokkit convention: every row belongs to exactly one auth.users
// account, RLS keeps it private, and rows cascade away when the account
// is deleted. One row per FCM token (globally unique) so the same
// browser/device re-registering idempotently updates its own row instead
// of piling up.
//
// All token lookups go through the service-role client so a caller can
// never read or claim a token by guessing it — ownership is always
// re-checked against the authenticated user before any write.

export interface FcmTokenRow {
  id: string;
  user_id: string;
  token: string;
  revoked: boolean;
}

export interface FcmTokenRecord {
  user_id: string;
  token: string;
  platform: 'web';
  user_agent: string | null;
}

export interface FcmTokenStore {
  findByToken(token: string): Promise<FcmTokenRow | null>;
  insert(record: FcmTokenRecord): Promise<void>;
  updateOwnedToken(token: string, userId: string, patch: Partial<FcmTokenRecord>): Promise<boolean>;
  revokeOwnedToken(token: string, userId: string): Promise<boolean>;
  revokeByToken(token: string): Promise<boolean>;
}

export type RegisterFcmTokenResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

const TOKEN_CLAIMED = 'This token is already registered to another account.';

export async function registerFcmToken(
  store: FcmTokenStore,
  userId: string,
  input: { token: string; platform: string; userAgent: string | null }
): Promise<RegisterFcmTokenResult> {
  const token = normalizeFcmToken(input.token);
  if (!token) return { ok: false, status: 400, error: 'Invalid FCM token' };
  if (input.platform !== 'web') return { ok: false, status: 400, error: 'Unsupported platform' };

  const record: FcmTokenRecord = {
    user_id: userId,
    token,
    platform: 'web',
    user_agent: sanitizeUserAgent(input.userAgent),
  };

  const existing = await store.findByToken(token);
  if (existing) {
    if (existing.user_id !== userId) {
      return { ok: false, status: 409, error: TOKEN_CLAIMED };
    }
    await store.updateOwnedToken(token, userId, {
      platform: 'web',
      user_agent: record.user_agent,
    });
    return { ok: true };
  }

  try {
    await store.insert(record);
    return { ok: true };
  } catch (err) {
    // A concurrent registration of the same token (e.g. two devices on
    // the same account, or a token registered between our find and our
    // insert) surfaces as a unique-violation. Re-check ownership instead
    // of failing blind.
    if (!isUniqueViolation(err)) throw err;

    const winner = await store.findByToken(token);
    if (!winner || winner.user_id === userId) return { ok: true };
    return { ok: false, status: 409, error: TOKEN_CLAIMED };
  }
}

export async function revokeFcmToken(
  store: FcmTokenStore,
  userId: string,
  token: string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const normalized = normalizeFcmToken(token);
  if (!normalized) return { ok: false, status: 400, error: 'Invalid FCM token' };

  await store.revokeOwnedToken(normalized, userId);
  return { ok: true };
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505'
  );
}

// ── Supabase-backed store ─────────────────────────────────────────
// Reads/writes via the service-role client (RLS-independent, like every
// other privileged route in the app: verifyUser has already confirmed the
// caller, and token ownership is enforced in the queries themselves).

export const supabaseFcmTokenStore: FcmTokenStore = {
  async findByToken(token) {
    const { data } = await supabaseAdmin
      .from('fcm_tokens')
      .select('id, user_id, token, revoked')
      .eq('token', token)
      .maybeSingle();
    return (data as FcmTokenRow | null) ?? null;
  },

  async insert(record) {
    const { error } = await supabaseAdmin.from('fcm_tokens').insert(record);
    if (error) throw error;
  },

  async updateOwnedToken(token, userId, patch) {
    const { data } = await supabaseAdmin
      .from('fcm_tokens')
      .update(patch)
      .eq('token', token)
      .eq('user_id', userId)
      .select('id');
    return Array.isArray(data) && data.length > 0;
  },

  async revokeOwnedToken(token, userId) {
    const { data } = await supabaseAdmin
      .from('fcm_tokens')
      .update({ revoked: true, updated_at: new Date().toISOString() })
      .eq('token', token)
      .eq('user_id', userId)
      .select('id');
    return Array.isArray(data) && data.length > 0;
  },

  // Server-side disable used when the push service reports a token is no
  // longer valid during sending. The v1 sender runs with a service-role
  // client and does not know which account owns a token, so this is
  // deliberately not scoped to a single user.
  async revokeByToken(token) {
    const { data } = await supabaseAdmin
      .from('fcm_tokens')
      .update({ revoked: true, updated_at: new Date().toISOString() })
      .eq('token', token)
      .select('id');
    return Array.isArray(data) && data.length > 0;
  },
};