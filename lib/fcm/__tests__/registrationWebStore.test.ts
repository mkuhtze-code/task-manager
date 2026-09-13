import { describe, it, expect, beforeEach, vi } from 'vitest';

// The web token store must read/write ONLY the browser-owned
// fcm_web_tokens table. public.fcm_tokens is owned by the Android app and
// must never be touched from the web path.
const { mockFrom, chain } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
  chain.select.mockImplementation(() => chain);
  chain.eq.mockImplementation(() => chain);
  chain.maybeSingle.mockImplementation(async () => ({ data: null }));
  chain.insert.mockImplementation(async () => ({ error: null }));
  chain.update.mockImplementation(() => chain);
  mockFrom.mockImplementation(() => chain);
  return { mockFrom, chain };
});

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: { from: mockFrom },
}));

import { supabaseFcmWebTokenStore } from '../registration';

const TOKEN = 'cXtGXxKZQzMYJ4DOHlAOjBIL9X5GPZ17huWACHdRc-Tq2o4VF4Nxw1cbqJZa4ebP:APA91bFJzVXpYHib9PjY6m_XuFvcWvYFnZ2ozc9gfWMXvQ5sYHd3hqH8Ssy_Z7y2nKQbpwfPmq3dHxByfLa0C7Q6nUezBtm9Y2rL4kP7Nq5u9o1WrA0SvCxJfE';

function tablesTouched(): string[] {
  return mockFrom.mock.calls.map((args) => args[0] as string);
}

describe('supabaseFcmWebTokenStore', () => {
  beforeEach(() => {
    mockFrom.mockClear();
    chain.select.mockClear();
    chain.eq.mockClear();
    chain.maybeSingle.mockClear();
    chain.insert.mockClear();
    chain.update.mockClear();
  });

  it('looks up tokens only in the fcm_web_tokens table', async () => {
    chain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'row-1', user_id: 'user-1', token: TOKEN, revoked: false },
    });

    const row = await supabaseFcmWebTokenStore.findByToken(TOKEN);

    expect(row).toEqual({ id: 'row-1', user_id: 'user-1', token: TOKEN, revoked: false });
    expect(chain.select).toHaveBeenCalledWith('id, user_id, token, revoked');
    expect(chain.eq).toHaveBeenCalledWith('token', TOKEN);
    expect(tablesTouched()).toEqual(['fcm_web_tokens']);
  });

  it('inserts web registrations into fcm_web_tokens', async () => {
    await supabaseFcmWebTokenStore.insert({
      user_id: 'user-1',
      token: TOKEN,
      platform: 'web',
      user_agent: null,
    });

    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      token: TOKEN,
      platform: 'web',
      user_agent: null,
    });
    expect(tablesTouched()).toEqual(['fcm_web_tokens']);
  });

  it('updates only tokens owned by the authenticated user', async () => {
    chain.eq.mockReturnValueOnce(chain);
    chain.select.mockResolvedValueOnce({ data: [{ id: 'row-1' }] });

    const updated = await supabaseFcmWebTokenStore.updateOwnedToken(TOKEN, 'user-1', {
      platform: 'web',
      user_agent: 'Mozilla/5.0',
    });

    expect(updated).toBe(true);
    expect(chain.eq).toHaveBeenCalledWith('token', TOKEN);
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(tablesTouched()).toEqual(['fcm_web_tokens']);
  });

  it('returns false when the ownership update touches no rows', async () => {
    const updated = await supabaseFcmWebTokenStore.updateOwnedToken(TOKEN, 'other-user', {
      platform: 'web',
      user_agent: null,
    });

    expect(updated).toBe(false);
    expect(tablesTouched()).toEqual(['fcm_web_tokens']);
  });

  it('revokes a token owned by the user, setting revoked and updated_at', async () => {
    await supabaseFcmWebTokenStore.revokeOwnedToken(TOKEN, 'user-1');

    const [patch] = chain.update.mock.calls[0];
    expect(patch).toMatchObject({ revoked: true });
    expect((patch as { updated_at: string }).updated_at).toBeTruthy();
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(tablesTouched()).toEqual(['fcm_web_tokens']);
  });

  it('server-side revokeByToken targets fcm_web_tokens only', async () => {
    await supabaseFcmWebTokenStore.revokeByToken(TOKEN);

    const [patch] = chain.update.mock.calls[0];
    expect(patch).toMatchObject({ revoked: true });
    expect(tablesTouched()).toEqual(['fcm_web_tokens']);
  });
});