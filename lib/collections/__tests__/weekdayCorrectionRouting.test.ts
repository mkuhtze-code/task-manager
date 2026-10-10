import { describe, expect, it } from 'vitest';
import { detectCollectionIntent } from '../intent';

describe('weekday correction routing', () => {
  const activeListContext = {
    activeCollectionId: 'active-list',
    msSinceLastActivity: 1_000,
  };

  it('does not divert concise weekday corrections into list mutations', () => {
    for (const phrase of [
      'Actually, make that Friday.',
      'Move it to Monday.',
      'Change it to Friday.',
      'Change the date to Monday.',
    ]) {
      expect(
        detectCollectionIntent(phrase, activeListContext),
        `Expected task/date correction to bypass list detection: ${phrase}`,
      ).toBeNull();
    }
  });

  it('continues to recognise explicit list creation', () => {
    expect(
      detectCollectionIntent('Start a grocery list and add milk to it')?.type,
    ).toBe('create_collection');
  });
});
