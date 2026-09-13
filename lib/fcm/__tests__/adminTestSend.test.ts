import { describe, it, expect } from 'vitest';
import { selectTestTargetToken, buildTestWebPushMessage } from '../adminTestSend';

describe('selectTestTargetToken', () => {
  const tokens = [
    { token: 'newest' },
    { token: 'older' },
    { token: 'oldest' },
  ];

  it('picks the most recently updated token by default', () => {
    expect(selectTestTargetToken(tokens, null)).toBe('newest');
  });

  it('picks the oldest when that is the only candidate', () => {
    expect(selectTestTargetToken([tokens[2]], null)).toBe('oldest');
  });

  it('returns null when there are no candidates', () => {
    expect(selectTestTargetToken([], null)).toBeNull();
    expect(selectTestTargetToken([], 'some-token')).toBeNull();
  });

  it('targets the explicitly requested token when it exists', () => {
    expect(selectTestTargetToken(tokens, 'older')).toBe('older');
  });

  it('returns null for a requested token that is not among the candidates', () => {
    expect(selectTestTargetToken(tokens, 'missing-token')).toBeNull();
  });
});

describe('buildTestWebPushMessage', () => {
  it('builds a data-only, fcm-marked test message for the given token', () => {
    const msg = buildTestWebPushMessage('token-123');
    expect(msg).toEqual({
      token: 'token-123',
      title: 'Dokkit',
      body: 'FCM web push test notification.',
      destination: '/app',
      type: 'test',
    });
  });
});