import { describe, expect, it } from 'vitest';
import {
  resolveJobAndLocation,
  hasEntityResolution,
  deriveAliasTerm,
  normalizeAliasPhrase,
  type EntityRelationshipMemory,
} from '@/lib/unifiedInput/resolve';
import { parseThought } from '@/lib/unifiedInput/parse';
import type { Job } from '@/lib/jobTypes';

const TODAY = '2026-09-04';

function job(partial: Partial<Job> & { id: string; name: string }): Job {
  return {
    client: null,
    location_text: null,
    lat: null,
    lng: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

// Builds a memory for the resolver. `active` defaults to every referenced job
// being active, so activeness is only exercised where a test asks for it.
function memory(
  aliases: { alias: string; entityId: string }[],
  activeIds?: string[],
): EntityRelationshipMemory {
  return {
    aliases: aliases.map((a) => ({ alias: a.alias, entityType: 'job' as const, entityId: a.entityId })),
    ...(activeIds ? { activeEntityIds: new Set(activeIds) } : {}),
  };
}

const KITCHEN_JOBS: Job[] = [
  job({ id: 'fix-kitchen', name: 'Fix Kitchen' }),
  job({ id: 'johns-kitchen', name: 'Johns Kitchen' }),
];

// The single-job world: only Fix Kitchen exists, so "Kitchen" and
// "new tap for Kitchen" yield exactly one fuzzy candidate (V1.1 → ask).
const ONE_KITCHEN_JOB: Job[] = [job({ id: 'fix-kitchen', name: 'Fix Kitchen' })];

describe('resolveJobAndLocation', () => {
  it('proposes the single reliable Belgium Road job', () => {
    const parts = parseThought('Belgium Rd tomorrow at 10am to measure Rainwater Head', TODAY);
    const jobs: Job[] = [
      job({ id: 'j1', name: 'Belgium Road', location_text: '14 Belgium Road, Wimbledon', lat: 51.4, lng: -0.2 }),
    ];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('proposed');
    if (res.state === 'proposed') {
      expect(res.candidate.jobId).toBe('j1');
      expect(res.candidate.jobName).toBe('Belgium Road');
      // Prefer the concrete address for the confirmation prompt.
      expect(res.candidate.matchedField).toBe('location');
      expect(res.candidate.locationText).toBe('14 Belgium Road, Wimbledon');
    }
  });

  it('shows choices when several Belgium Road jobs match', () => {
    const parts = parseThought('Belgium Rd tomorrow to measure Rainwater Head', TODAY);
    const jobs: Job[] = [
      job({ id: 'j1', name: 'Belgium Road', location_text: '14 Belgium Road' }),
      job({ id: 'j2', name: 'Belgium Road Extension', location_text: '60 Belgium Road' }),
    ];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('choose');
    if (res.state === 'choose') {
      expect(res.candidates.length).toBe(2);
      expect(res.candidates.map((c) => c.jobId).sort()).toEqual(['j1', 'j2']);
    }
  });

  it('leaves the relationship unresolved when there is no match (never invents)', () => {
    const parts = parseThought('Belgium Rd tomorrow to measure Rainwater Head', TODAY);
    const jobs: Job[] = [job({ id: 'j1', name: 'Garden Shed' })];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('none');
  });

  it('returns none with no jobs', () => {
    const parts = parseThought('Belgium Rd tomorrow to measure Rainwater Head', TODAY);
    const res = resolveJobAndLocation(parts, []);
    expect(res.state).toBe('none');
  });

  it('does not resolve plain task text that names nothing', () => {
    const parts = parseThought('Call the dentist tomorrow', TODAY);
    const jobs: Job[] = [job({ id: 'j1', name: 'Belgium Road' })];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('none');
  });

  // ── V1.1: progressive resolution of short names without a street suffix ──
  it('resolves a bare short name to the fuller street-titled job', () => {
    // "Gladstone" (no street suffix) → the job named "Gladstone Street".
    const parts = parseThought('Gladstone', TODAY);
    const jobs: Job[] = [
      job({ id: 'j1', name: 'Gladstone Street', location_text: '12 Gladstone Street' }),
    ];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('proposed');
    if (res.state === 'proposed') expect(res.candidate.jobId).toBe('j1');
  });

  it('progressively matches a leading fragment of a longer entity name', () => {
    const parts = parseThought('Glads', TODAY);
    const jobs: Job[] = [job({ id: 'j1', name: 'Gladstone Street' })];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('proposed');
    if (res.state === 'proposed') expect(res.candidate.jobId).toBe('j1');
  });

  it('asks which Gladstone when several short-name matches exist', () => {
    const parts = parseThought('Gladstone', TODAY);
    const jobs: Job[] = [
      job({ id: 'j1', name: 'Gladstone Street' }),
      job({ id: 'j2', name: 'Gladstone Road', location_text: '4 Gladstone Road' }),
    ];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('choose');
    if (res.state === 'choose') {
      expect(res.candidates.map((c) => c.jobId).sort()).toEqual(['j1', 'j2']);
    }
  });

  it('does not over-match a short query against an unrelated long token', () => {
    // "at" is too short to be a progressive prefix and matches nothing real.
    const parts = parseThought('meet at 2pm', TODAY);
    const jobs: Job[] = [job({ id: 'j1', name: 'Atlantic Avenue' })];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('none');
  });

// ── V1.1: entity resolution is independent of date/time/other facets ──
  it('recognises the entity from a facet-less thought ("Belgium needs attention")', () => {
    const parts = parseThought('Belgium needs attention', TODAY);
    // No date, no time, no location hint, no priority — yet the entity must
    // still resolve and be surfaced.
    expect(parts.hadFacets).toBe(false);
    const res = resolveJobAndLocation(parts, [
      job({ id: 'j1', name: 'Belgium Road', location_text: '14 Belgium Road' }),
    ]);
    expect(res.state).toBe('proposed');
    if (res.state === 'proposed') expect(res.candidate.jobId).toBe('j1');
    expect(hasEntityResolution(res)).toBe(true);
  });

  it('recognises the entity the same way when a date is also present', () => {
    const parts = parseThought('Belgium needs attention on Monday', TODAY);
    expect(parts.date).toBe('2026-09-07');
    const res = resolveJobAndLocation(parts, [
      job({ id: 'j1', name: 'Belgium Road', location_text: '14 Belgium Road' }),
    ]);
    expect(res.state).toBe('proposed');
    if (res.state === 'proposed') expect(res.candidate.jobId).toBe('j1');
    expect(hasEntityResolution(res)).toBe(true);
  });

  it('surfaces a bare entity the user simply names ("Belgium")', () => {
    const parts = parseThought('Belgium', TODAY);
    expect(parts.hadFacets).toBe(false);
    const res = resolveJobAndLocation(parts, [
      job({ id: 'j1', name: 'Belgium Road', location_text: '14 Belgium Road' }),
    ]);
    expect(res.state).toBe('proposed');
    if (res.state === 'proposed') expect(res.candidate.jobId).toBe('j1');
    expect(hasEntityResolution(res)).toBe(true);
  });

  it('falls back to the existing choice behaviour when the entity is ambiguous', () => {
    const res = resolveJobAndLocation(parseThought('Belgium', TODAY), [
      job({ id: 'j1', name: 'Belgium Road' }),
      job({ id: 'j2', name: 'Belgium Avenue', location_text: '4 Belgium Avenue' }),
    ]);
    expect(res.state).toBe('choose');
    expect(hasEntityResolution(res)).toBe(true);
  });

  it('recognises a known entity mid-thought after an obligation filler', () => {
    const parts = parseThought('Need to reprice the spouting for Gladstone', TODAY);
    expect(parts.date).toBeNull();
    const res = resolveJobAndLocation(parts, [
      job({ id: 'g1', name: 'Gladstone Street', location_text: '12 Gladstone Street' }),
    ]);
    expect(res.state).toBe('proposed');
    if (res.state === 'proposed') expect(res.candidate.jobId).toBe('g1');
    expect(hasEntityResolution(res)).toBe(true);
  });

  it('leaves a thought unresolved when no entity is recognised', () => {
    const res = resolveJobAndLocation(parseThought('paint the fence', TODAY), [
      job({ id: 'j1', name: 'Belgium Road' }),
    ]);
    expect(res.state).toBe('none');
    expect(hasEntityResolution(res)).toBe(false);
  });

  // ── V1.2: persistent user-confirmed entity relationships ──
  describe('confirmed entity relationships', () => {
    it('still requires confirmation when no relationship was ever confirmed', () => {
      // The "Kitchen" candidate exists, but with no memory the resolver must
      // ask exactly as V1.1 did — it never silently assigns.
      const parts = parseThought('Kitchen', TODAY);
      const res = resolveJobAndLocation(parts, ONE_KITCHEN_JOB);
      expect(res.state).toBe('proposed');
      if (res.state === 'proposed') expect(res.candidate.jobId).toBe('fix-kitchen');
    });

    it('resolves automatically on later input once the relationship is confirmed', () => {
      // The user previously confirmed "Kitchen → Fix Kitchen".
      const parts = parseThought('new tap for Kitchen', TODAY);
      const res = resolveJobAndLocation(
        parts,
        KITCHEN_JOBS,
        memory([{ alias: 'kitchen', entityId: 'fix-kitchen' }]),
      );
      expect(res.state).toBe('known');
      if (res.state === 'known') expect(res.candidate.jobId).toBe('fix-kitchen');
    });

    it('resolves the bare confirmed term itself without a prompt', () => {
      const parts = parseThought('Kitchen', TODAY);
      const res = resolveJobAndLocation(
        parts,
        KITCHEN_JOBS,
        memory([{ alias: 'kitchen', entityId: 'fix-kitchen' }]),
      );
      expect(res.state).toBe('known');
      if (res.state === 'known') expect(res.candidate.jobId).toBe('fix-kitchen');
    });

    it('does not inherit another user/context relationship (nothing is hardcoded)', () => {
      // No memory for THIS resolution: even though a relationship exists in
      // the world, a resolver with an empty/absent memory behaves as V1.1.
      const parts = parseThought('new tap for Kitchen', TODAY);
      const res = resolveJobAndLocation(parts, ONE_KITCHEN_JOB, memory([]));
      expect(res.state).toBe('proposed');
      if (res.state === 'proposed') expect(res.candidate.jobId).toBe('fix-kitchen');
    });

    it('keeps a location-phrase relationship working via the road hint', () => {
      const jobs: Job[] = [
        job({ id: 'j1', name: 'Fix Kitchen', location_text: '14 Belgium Road' }),
      ];
      const parts = parseThought('Belgium Rd tomorrow at 10am to measure Rainwater Head', TODAY);
      const res = resolveJobAndLocation(parts, jobs, memory([{ alias: 'belgium road', entityId: 'j1' }]));
      expect(res.state).toBe('known');
      if (res.state === 'known') {
        expect(res.candidate.jobId).toBe('j1');
        expect(res.candidate.matchedField).toBe('location');
      }
    });

    it('matches a progressive fragment of a previously confirmed term', () => {
      const parts = parseThought('new tap for Kit', TODAY);
      const res = resolveJobAndLocation(
        parts,
        KITCHEN_JOBS,
        memory([{ alias: 'kitchen', entityId: 'fix-kitchen' }]),
      );
      expect(res.state).toBe('known');
      if (res.state === 'known') expect(res.candidate.jobId).toBe('fix-kitchen');
    });

    it('stays ambiguous when the same term was confirmed for two entities', () => {
      const parts = parseThought('Kitchen needs measuring', TODAY);
      const res = resolveJobAndLocation(
        parts,
        KITCHEN_JOBS,
        memory([
          { alias: 'kitchen', entityId: 'fix-kitchen' },
          { alias: 'kitchen', entityId: 'johns-kitchen' },
        ]),
      );
      expect(res.state).toBe('choose');
      if (res.state === 'choose') {
        expect(res.candidates.map((c) => c.jobId).sort()).toEqual(['fix-kitchen', 'johns-kitchen']);
      }
    });

    it('prefers the confirmed relationship over a tie with an unconfirmed job', () => {
      // Only Fix Kitchen was ever confirmed. "Johns Kitchen" matches the term
      // too (an equal fuzzy tie), but the learned relationship has authority.
      const parts = parseThought('Kitchen', TODAY);
      const res = resolveJobAndLocation(
        parts,
        KITCHEN_JOBS,
        memory([{ alias: 'kitchen', entityId: 'fix-kitchen' }]),
      );
      expect(res.state).toBe('known');
      if (res.state === 'known') expect(res.candidate.jobId).toBe('fix-kitchen');
    });

    it('lets an explicitly named job win even when an alias exists for the term', () => {
      // "Johns Kitchen" is textually identified strictly more strongly than
      // the aliased Fix Kitchen, so it must never be silently overridden.
      const parts = parseThought('Johns Kitchen', TODAY);
      const res = resolveJobAndLocation(
        parts,
        KITCHEN_JOBS,
        memory([{ alias: 'kitchen', entityId: 'fix-kitchen' }]),
      );
      expect(res.state).toBe('choose');
      if (res.state === 'choose') {
        // The explicit job is among the choices and Fix Kitchen is NOT forced.
        expect(res.candidates.map((c) => c.jobId)).toContain('johns-kitchen');
        expect(res.candidates[0].jobId).toBe('johns-kitchen');
      }
    });

    it('never forces an entity the lifecycle no longer considers active', () => {
      // Fix Kitchen has been confirmed, but the job is now fully done and is
      // excluded from activeEntityIds — the relationship expires instead of
      // blindly forcing it, and the normal fuzzy ask returns.
      const parts = parseThought('new tap for Kitchen', TODAY);
      const res = resolveJobAndLocation(
        parts,
        KITCHEN_JOBS,
        memory([{ alias: 'kitchen', entityId: 'fix-kitchen' }], ['johns-kitchen']),
      );
      expect(res.state).not.toBe('known');
    });

    it('ignores a relationship that has been taken out of use (active: false)', () => {
      const parts = parseThought('new tap for Kitchen', TODAY);
      const mem: EntityRelationshipMemory = {
        aliases: [{ alias: 'kitchen', entityType: 'job', entityId: 'fix-kitchen', active: false }],
      };
      const res = resolveJobAndLocation(parts, ONE_KITCHEN_JOB, mem);
      expect(res.state).toBe('proposed');
    });

    it('leaves genuinely unknown terms exactly as before', () => {
      const parts = parseThought('unrelated errand', TODAY);
      const res = resolveJobAndLocation(
        parts,
        KITCHEN_JOBS,
        memory([{ alias: 'kitchen', entityId: 'fix-kitchen' }]),
      );
      expect(res.state).toBe('none');
    });
  });

  // ── V1.2: the term persisted when a confirmation is accepted ──
  describe('deriveAliasTerm', () => {
    it('derives the single distinctive token from a chatty intent', () => {
      const parts = parseThought('new tap for Kitchen', TODAY);
      const res = resolveJobAndLocation(parts, ONE_KITCHEN_JOB);
      if (res.state !== 'proposed') throw new Error('expected proposed');
      expect(deriveAliasTerm(parts, res.candidate)).toBe('kitchen');
    });

    it('derives the road phrase from a location-matched candidate', () => {
      const jobs: Job[] = [
        job({ id: 'j1', name: 'Fix Kitchen', location_text: '14 Belgium Road' }),
      ];
      const parts = parseThought('Belgium Rd tomorrow at 10am to measure Rainwater Head', TODAY);
      const res = resolveJobAndLocation(parts, jobs);
      if (res.state !== 'proposed') throw new Error('expected proposed, got ' + res.state);
      expect(deriveAliasTerm(parts, res.candidate)).toBe('belgium road');
    });

    it('derives the full distinctive name when the whole name was typed', () => {
      const parts = parseThought('Fix Kitchen', TODAY);
      const res = resolveJobAndLocation(parts, ONE_KITCHEN_JOB);
      if (res.state !== 'proposed') throw new Error('expected proposed');
      expect(deriveAliasTerm(parts, res.candidate)).toBe('fix kitchen');
    });
  });

  describe('normalizeAliasPhrase', () => {
    it('lower-cases and expands road abbreviations', () => {
      expect(normalizeAliasPhrase('Belgium Rd')).toBe('belgium road');
      expect(normalizeAliasPhrase('Kitchen')).toBe('kitchen');
      expect(normalizeAliasPhrase('')).toBe('');
    });
  });
});
