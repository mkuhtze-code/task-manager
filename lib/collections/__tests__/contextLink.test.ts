import { describe, it, expect } from 'vitest';
import { resolveContextLink } from '../contextLink';
import { detectCollectionIntent } from '../intent';
import { emptyStore, applyCollectionIntent } from '../service';

describe('resolveContextLink', () => {
  const jobs = [
    { id: 'j1', name: 'Smith Street' },
    { id: 'j2', name: 'Harbour Bridge' },
  ];

  it('links unique job by name', () => {
    const link = resolveContextLink('Smith Street', { jobs });
    expect(link).toEqual({ contextType: 'job', contextId: 'j1' });
  });

  it('links partial unique match', () => {
    const link = resolveContextLink('Harbour', { jobs });
    expect(link?.contextId).toBe('j2');
  });

  it('returns null when ambiguous', () => {
    const link = resolveContextLink('Street', {
      jobs: [
        { id: 'a', name: 'Smith Street' },
        { id: 'b', name: 'Queen Street' },
      ],
    });
    expect(link).toBeNull();
  });

  it('returns null when no jobs', () => {
    expect(resolveContextLink('Smith Street', {})).toBeNull();
  });
});

describe('detect + apply context', () => {
  it('create intent carries job context when unique', () => {
    const intent = detectCollectionIntent('Start a snag list for Smith Street', {
      jobs: [{ id: 'j1', name: 'Smith Street' }],
    });
    expect(intent?.type).toBe('create_collection');
    if (intent?.type === 'create_collection') {
      expect(intent.contextType).toBe('job');
      expect(intent.contextId).toBe('j1');
      expect(intent.contextHint).toMatch(/Smith Street/i);
    }

    const result = applyCollectionIntent(emptyStore('u1'), 'u1', intent!);
    expect(result.ok).toBe(true);
    expect(result.collection?.contextType).toBe('job');
    expect(result.collection?.contextId).toBe('j1');
    expect(result.message.toLowerCase()).toMatch(/linked job/);
  });
});
