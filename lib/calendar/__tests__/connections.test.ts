import { describe, expect, it } from 'vitest';
import { connectionKey } from '@/lib/calendar/store';

describe('connectionKey - one row per calendar account', () => {
  it('distinguishes multiple accounts for the same user/provider', () => {
    expect(connectionKey('user-1', 'microsoft', 'work-account')).not.toBe(
      connectionKey('user-1', 'microsoft', 'personal-account')
    );
  });

  it('keys by provider so Google never collides with Microsoft', () => {
    expect(connectionKey('user-1', 'microsoft', 'acct')).not.toBe(
      connectionKey('user-1', 'google', 'acct')
    );
  });

  it('keys by user so two users never share a connection', () => {
    expect(connectionKey('user-1', 'microsoft', 'acct')).not.toBe(
      connectionKey('user-2', 'microsoft', 'acct')
    );
  });

  it('is deterministic for the same inputs', () => {
    expect(connectionKey('user-1', 'microsoft', 'acct')).toBe(
      connectionKey('user-1', 'microsoft', 'acct')
    );
  });
});