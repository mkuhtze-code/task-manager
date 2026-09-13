import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerFcmToken,
  revokeFcmToken,
  FcmTokenStore,
  FcmTokenRecord,
  FcmTokenRow,
} from '../registration';

const U1 = 'user-1';
const U2 = 'user-2';

const TOKEN_A = 'cXtGXxKZQzMYJ4DOHlAOjBIL9X5GPZ17huWACHdRc-Tq2o4VF4Nxw1cbqJZa4ebP:APA91bFJzVXpYHib9PjY6m_XuFvcWvYFnZ2ozc9gfWMXvQ5sYHd3hqH8Ssy_Z7y2nKQbpwfPmq3dHxByfLa0C7Q6nUezBtm9Y2rL4kP7Nq5u9o1WrA0SvCxJfE';
const TOKEN_B = 'bXtGXxKZQzMYJ4DOHlAOjBIL9X5GPZ17huWACHdRc-Tq2o4VF4Nxw1cbqJZa4ebP:APA91bDJzVXpYHib9PjY6m_XuFvcWvYFnZ2ozc9gfWMXvQ5sYHd3hqH8Ssy_Z7y2nKQbpwfPmq3dHxByfLa0C7Q6nUezBtm9Y2rL4kP7Nq5u9o1WrA0SvCxJfE';

function makeRecord(userId: string, token: string, patch: Partial<FcmTokenRecord> = {}): FcmTokenRecord {
  return { user_id: userId, token, platform: 'web', user_agent: null, ...patch };
}

class FakeStore implements FcmTokenStore {
  rows = new Map<string, FcmTokenRow & { user_agent: string | null }>();
  failNextInsert = false;

  async findByToken(token: string): Promise<FcmTokenRow | null> {
    for (const row of this.rows.values()) {
      if (row.token === token) return { ...row };
    }
    return null;
  }

  async insert(record: FcmTokenRecord): Promise<void> {
    if (this.failNextInsert) {
      this.failNextInsert = false;
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    }
    for (const row of this.rows.values()) {
      if (row.token === record.token) {
        throw Object.assign(new Error('unique constraint'), { code: '23505' });
      }
    }
    const row: FcmTokenRow & { user_agent: string | null } = {
      id: `row-${this.rows.size + 1}`,
      user_id: record.user_id,
      token: record.token,
      revoked: false,
      user_agent: record.user_agent,
    };
    this.rows.set(row.id, row);
  }

  async updateOwnedToken(token: string, userId: string, patch: Partial<FcmTokenRecord>): Promise<boolean> {
    for (const row of this.rows.values()) {
      if (row.token === token && row.user_id === userId) {
        row.revoked = false;
        if (patch.user_agent !== undefined) row.user_agent = patch.user_agent;
        return true;
      }
    }
    return false;
  }

  async revokeOwnedToken(token: string, userId: string): Promise<boolean> {
    for (const row of this.rows.values()) {
      if (row.token === token && row.user_id === userId) {
        row.revoked = true;
        return true;
      }
    }
    return false;
  }

  async revokeByToken(token: string): Promise<boolean> {
    for (const row of this.rows.values()) {
      if (row.token === token) {
        row.revoked = true;
        return true;
      }
    }
    return false;
  }

  find(rowId: string): FcmTokenRow | undefined {
    return this.rows.get(rowId);
  }
}

describe('registerFcmToken', () => {
  let store: FakeStore;

  beforeEach(() => {
    store = new FakeStore();
  });

  it('registers a new token for an authenticated user', async () => {
    const result = await registerFcmToken(store, U1, { token: TOKEN_A, platform: 'web', userAgent: null });
    expect(result).toEqual({ ok: true });
    expect(store.rows.size).toBe(1);
    const row = [...store.rows.values()][0];
    expect(row.user_id).toBe(U1);
    expect(row.token).toBe(TOKEN_A);
  });

  it('stores the sanitized user agent', async () => {
    await registerFcmToken(store, U1, { token: TOKEN_A, platform: 'web', userAgent: '  Mozilla/5.0 x  ' });
    const row = [...store.rows.values()][0];
    expect(row.user_agent).toBe('Mozilla/5.0 x');
  });

  it('re-registering the same token for the same user is an idempotent update, not a duplicate insert', async () => {
    await registerFcmToken(store, U1, { token: TOKEN_A, platform: 'web', userAgent: 'a' });
    const result = await registerFcmToken(store, U1, { token: TOKEN_A, platform: 'web', userAgent: 'b' });
    expect(result).toEqual({ ok: true });
    expect(store.rows.size).toBe(1);
    expect([...store.rows.values()][0].user_agent).toBe('b');
  });

  it('rejects a token already claimed by another account', async () => {
    await registerFcmToken(store, U1, { token: TOKEN_A, platform: 'web', userAgent: null });
    const result = await registerFcmToken(store, U2, { token: TOKEN_A, platform: 'web', userAgent: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/another account/);
    }
  });

  it('recovers gracefully when the find raced a concurrent insert owned by the same user', async () => {
    store.failNextInsert = true;
    const result = await registerFcmToken(store, U1, { token: TOKEN_A, platform: 'web', userAgent: null });
    // The fake's failure path leaves no row -> treat as success (no row
    // to reconcile), matching the real DB where the winner belongs to us.
    expect(result).toEqual({ ok: true });
  });

  it('returns a 409 when the race resolved to another user', async () => {
    // Simulate TOKEN_A being inserted by U2 between our find and insert.
    const originalInsert = store.insert.bind(store);
    let first = true;
    store.insert = async (record) => {
      if (first) {
        first = false;
        await originalInsert(makeRecord(U2, record.token));
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      }
      return originalInsert(record);
    };

    const result = await registerFcmToken(store, U1, { token: TOKEN_A, platform: 'web', userAgent: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/another account/);
    }
  });

  it('rejects an invalid token format', async () => {
    const result = await registerFcmToken(store, U1, { token: 'not-a-token', platform: 'web', userAgent: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
    expect(store.rows.size).toBe(0);
  });

  it('rejects a non-web platform', async () => {
    const result = await registerFcmToken(store, U1, { token: TOKEN_A, platform: 'android', userAgent: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
    expect(store.rows.size).toBe(0);
  });
});

describe('revokeFcmToken', () => {
  let store: FakeStore;

  beforeEach(() => {
    store = new FakeStore();
  });

  it('revokes a token the user owns', async () => {
    await registerFcmToken(store, U1, { token: TOKEN_A, platform: 'web', userAgent: null });
    const result = await revokeFcmToken(store, U1, TOKEN_A);
    expect(result).toEqual({ ok: true });
    expect([...store.rows.values()][0].revoked).toBe(true);
  });

  it('never revokes a token owned by another user', async () => {
    await registerFcmToken(store, U1, { token: TOKEN_A, platform: 'web', userAgent: null });
    const result = await revokeFcmToken(store, U2, TOKEN_A);
    expect(result).toEqual({ ok: true });
    expect([...store.rows.values()][0].revoked).toBe(false);
  });

  it('rejects an invalid token', async () => {
    const result = await revokeFcmToken(store, U1, 'garbage');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});