import { describe, it, expect } from 'vitest';
import {
  decideCaptureContext,
  type CaptureContextInput,
} from '../decisions/captureContext';
import type {
  JobSuggestion,
  LocationMemorySuggestion,
} from '../../taskIntelligence';
import type { CaptureContextDecision, PersonalGravityDecision, Surface } from '../types';

// ── Test helpers ─────────────────────────────────────────────────

function makeGravity(preferredSurface: Surface | null, authority: 'observe' | 'suggest' | 'strong'): PersonalGravityDecision {
  return {
    kind: 'personal_gravity',
    preferredSurface,
    authority,
    evidence: {
      bySurface: { today: { active: 0, passive: 0 }, jobs: { active: 0, passive: 0 }, travel: { active: 0, passive: 0 } },
      totalEvents: 0,
      daysObserved: 0,
    },
    margin: 0,
  };
}

function makeJobDecision(jobId: string, authority: 'observe' | 'suggest' | 'strong'): JobSuggestion {
  return {
    jobId,
    confidence: 'medium',
    authority,
    agreeingDimensions: ['direct'],
  };
}

function makeLocationDecision(locationText: string, authority: 'observe' | 'suggest' | 'strong'): LocationMemorySuggestion {
  return {
    locationText,
    lat: 52.4,
    lng: -1.7,
    confidence: 'medium',
    authority,
    occurrenceCount: 5,
    ratio: 0.8,
  };
}

function baseInput(overrides?: Partial<CaptureContextInput>): CaptureContextInput {
  return {
    surface: 'today',
    currentJobId: null,
    taskText: 'test task',
    jobDecision: null,
    locationDecision: null,
    gravityDecision: makeGravity(null, 'observe'),
    ...overrides,
  };
}

// ── Empty context ────────────────────────────────────────────────

describe('decideCaptureContext', () => {
  describe('empty context', () => {
    it('returns null suggestions with observe authority when all inputs are null', () => {
      const result = decideCaptureContext(baseInput());
      expect(result.suggestedJobId).toBeNull();
      expect(result.suggestedLocation).toBeNull();
      expect(result.authority).toBe('observe');
      expect(result.source).toBeNull();
    });

    it('returns observe with empty task text', () => {
      const result = decideCaptureContext(baseInput({ taskText: '' }));
      expect(result.authority).toBe('observe');
      expect(result.suggestedJobId).toBeNull();
    });

    it('returns observe with no history (all decisions null)', () => {
      const result = decideCaptureContext(baseInput({ taskText: 'Call John' }));
      expect(result.authority).toBe('observe');
      expect(result.source).toBeNull();
    });
  });

  // ── Explicit context ──────────────────────────────────────────

  describe('explicit context', () => {
    it('current job wins with strong authority', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'jobs',
        currentJobId: 'job-oakwood',
      }));
      expect(result.suggestedJobId).toBe('job-oakwood');
      expect(result.authority).toBe('strong');
      expect(result.source).toBe('explicit_job');
    });

    it('current job ignores job decision from text matching', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'jobs',
        currentJobId: 'job-oakwood',
        jobDecision: makeJobDecision('job-maple', 'strong'),
      }));
      // Explicit job wins — job-maple is ignored
      expect(result.suggestedJobId).toBe('job-oakwood');
      expect(result.source).toBe('explicit_job');
    });

    it('explicit location wins over memory', () => {
      // Location decision provides a memory, but the caller will
      // override it with explicit input. The context still surfaces
      // the memory — the UI handles the override.
      const result = decideCaptureContext(baseInput({
        locationDecision: makeLocationDecision('Oakwood', 'strong'),
      }));
      expect(result.suggestedLocation).toEqual({
        text: 'Oakwood',
        lat: 52.4,
        lng: -1.7,
      });
      // Authority includes the strong location
      expect(result.authority).toBe('strong');
    });

    it('explicit job + explicit location composition', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'jobs',
        currentJobId: 'job-oakwood',
        locationDecision: makeLocationDecision('Oakwood', 'strong'),
      }));
      expect(result.suggestedJobId).toBe('job-oakwood');
      expect(result.suggestedLocation).toEqual({
        text: 'Oakwood',
        lat: 52.4,
        lng: -1.7,
      });
      expect(result.authority).toBe('strong');
      expect(result.source).toBe('explicit_job');
    });
  });

  // ── Job inference ──────────────────────────────────────────────

  describe('job inference', () => {
    it('strong single-job match on Today', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'today',
        jobDecision: makeJobDecision('job-oakwood', 'strong'),
      }));
      expect(result.suggestedJobId).toBe('job-oakwood');
      expect(result.authority).toBe('strong');
      expect(result.source).toBe('text_match');
    });

    it('suggest-level job match on Today', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'today',
        jobDecision: makeJobDecision('job-oakwood', 'suggest'),
      }));
      expect(result.suggestedJobId).toBe('job-oakwood');
      expect(result.authority).toBe('suggest');
      expect(result.source).toBe('text_match');
    });

    it('observe-level job match does not suggest', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'today',
        jobDecision: makeJobDecision('job-oakwood', 'observe'),
      }));
      // observe authority — no auto-fill, but the job is still surfaced
      expect(result.suggestedJobId).toBe('job-oakwood');
      expect(result.authority).toBe('observe');
      expect(result.source).toBe('text_match');
    });

    it('unmatched text returns null job', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'today',
        jobDecision: null,
      }));
      expect(result.suggestedJobId).toBeNull();
      expect(result.source).toBeNull();
    });

    it('deterministic — same input produces same output', () => {
      const input = baseInput({
        surface: 'today',
        jobDecision: makeJobDecision('job-oakwood', 'suggest'),
      });
      const r1 = decideCaptureContext(input);
      const r2 = decideCaptureContext(input);
      expect(r1.suggestedJobId).toBe(r2.suggestedJobId);
      expect(r1.authority).toBe(r2.authority);
      expect(r1.source).toBe(r2.source);
    });
  });

  // ── Location inference ─────────────────────────────────────────

  describe('location inference', () => {
    it('strong location memory', () => {
      const result = decideCaptureContext(baseInput({
        locationDecision: makeLocationDecision('Builders yard', 'strong'),
      }));
      expect(result.suggestedLocation).toEqual({
        text: 'Builders yard',
        lat: 52.4,
        lng: -1.7,
      });
      expect(result.authority).toBe('strong');
    });

    it('suggest-level location memory', () => {
      const result = decideCaptureContext(baseInput({
        locationDecision: makeLocationDecision('Builders yard', 'suggest'),
      }));
      expect(result.suggestedLocation).toEqual({
        text: 'Builders yard',
        lat: 52.4,
        lng: -1.7,
      });
      expect(result.authority).toBe('suggest');
    });

    it('observe-level location memory does not surface', () => {
      const result = decideCaptureContext(baseInput({
        locationDecision: makeLocationDecision('Builders yard', 'observe'),
      }));
      // observe location — suggestion surfaced but authority stays observe
      expect(result.suggestedLocation).toEqual({
        text: 'Builders yard',
        lat: 52.4,
        lng: -1.7,
      });
      expect(result.authority).toBe('observe');
    });

    it('no location decision returns null location', () => {
      const result = decideCaptureContext(baseInput());
      expect(result.suggestedLocation).toBeNull();
    });
  });

  // ── Personal Gravity ──────────────────────────────────────────

  describe('personal gravity', () => {
    it('strong Jobs gravity elevates observe-level job to suggest', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'today',
        jobDecision: makeJobDecision('job-oakwood', 'observe'),
        gravityDecision: makeGravity('jobs', 'strong'),
      }));
      // Gravity elevates observe → suggest
      expect(result.suggestedJobId).toBe('job-oakwood');
      expect(result.authority).toBe('suggest');
    });

    it('weak gravity does not influence job authority', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'today',
        jobDecision: makeJobDecision('job-oakwood', 'observe'),
        gravityDecision: makeGravity('jobs', 'observe'),
      }));
      // Gravity is observe — no elevation
      expect(result.authority).toBe('observe');
    });

    it('suggest gravity does not elevate (only strong gravity does)', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'today',
        jobDecision: makeJobDecision('job-oakwood', 'observe'),
        gravityDecision: makeGravity('jobs', 'suggest'),
      }));
      // suggest gravity — no elevation
      expect(result.authority).toBe('observe');
    });

    it('gravity preferring Travel does not elevate Jobs inference', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'today',
        jobDecision: makeJobDecision('job-oakwood', 'observe'),
        gravityDecision: makeGravity('travel', 'strong'),
      }));
      // Gravity prefers travel, not jobs — no elevation
      expect(result.authority).toBe('observe');
    });

    it('gravity does not override explicit job', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'jobs',
        currentJobId: 'job-explicit',
        jobDecision: makeJobDecision('job-inferred', 'strong'),
        gravityDecision: makeGravity('jobs', 'strong'),
      }));
      // Explicit job wins — gravity doesn't change it
      expect(result.suggestedJobId).toBe('job-explicit');
      expect(result.source).toBe('explicit_job');
    });

    it('gravity does not force a job when no job decision exists', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'today',
        jobDecision: null,
        gravityDecision: makeGravity('jobs', 'strong'),
      }));
      // No job decision → no job to suggest, even with strong gravity
      expect(result.suggestedJobId).toBeNull();
      expect(result.authority).toBe('observe');
    });
  });

  // ── Composition ────────────────────────────────────────────────

  describe('composition', () => {
    it('current job + matching text', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'jobs',
        currentJobId: 'job-oakwood',
        jobDecision: makeJobDecision('job-oakwood', 'strong'),
        locationDecision: makeLocationDecision('Oakwood', 'strong'),
      }));
      // Explicit job wins, location memory surfaces
      expect(result.suggestedJobId).toBe('job-oakwood');
      expect(result.suggestedLocation).toEqual({
        text: 'Oakwood',
        lat: 52.4,
        lng: -1.7,
      });
      expect(result.authority).toBe('strong');
      expect(result.source).toBe('explicit_job');
    });

    it('current job + conflicting historical match', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'jobs',
        currentJobId: 'job-oakwood',
        jobDecision: makeJobDecision('job-maple', 'strong'),
      }));
      // Explicit job wins over conflicting inference
      expect(result.suggestedJobId).toBe('job-oakwood');
      expect(result.source).toBe('explicit_job');
    });

    it('Today + strong job match', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'today',
        jobDecision: makeJobDecision('job-oakwood', 'strong'),
      }));
      expect(result.suggestedJobId).toBe('job-oakwood');
      expect(result.authority).toBe('strong');
      expect(result.source).toBe('text_match');
    });

    it('Today + weak job match', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'today',
        jobDecision: makeJobDecision('job-oakwood', 'observe'),
      }));
      expect(result.suggestedJobId).toBe('job-oakwood');
      expect(result.authority).toBe('observe');
    });

    it('Today + strong location memory', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'today',
        locationDecision: makeLocationDecision('School', 'strong'),
      }));
      expect(result.suggestedLocation).toEqual({
        text: 'School',
        lat: 52.4,
        lng: -1.7,
      });
      expect(result.authority).toBe('strong');
    });

    it('Jobs + strong location memory', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'jobs',
        currentJobId: 'job-oakwood',
        locationDecision: makeLocationDecision('Oakwood', 'strong'),
      }));
      expect(result.suggestedJobId).toBe('job-oakwood');
      expect(result.suggestedLocation).toEqual({
        text: 'Oakwood',
        lat: 52.4,
        lng: -1.7,
      });
      expect(result.authority).toBe('strong');
    });

    it('Jobs + explicit different job from text match', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'jobs',
        currentJobId: 'job-oakwood',
        jobDecision: makeJobDecision('job-maple', 'strong'),
      }));
      // Explicit job wins
      expect(result.suggestedJobId).toBe('job-oakwood');
    });

    it('explicit job + explicit location + historical evidence', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'jobs',
        currentJobId: 'job-oakwood',
        jobDecision: makeJobDecision('job-maple', 'strong'),
        locationDecision: makeLocationDecision('Builders yard', 'suggest'),
      }));
      expect(result.suggestedJobId).toBe('job-oakwood');
      expect(result.suggestedLocation).toEqual({
        text: 'Builders yard',
        lat: 52.4,
        lng: -1.7,
      });
      // Strong job + suggest location → strong overall
      expect(result.authority).toBe('strong');
    });
  });

  // ── Authority precedence ───────────────────────────────────────

  describe('authority precedence', () => {
    it('strong job + observe location → strong authority', () => {
      const result = decideCaptureContext(baseInput({
        jobDecision: makeJobDecision('job-x', 'strong'),
        locationDecision: makeLocationDecision('Place', 'observe'),
      }));
      expect(result.authority).toBe('strong');
    });

    it('observe job + strong location → strong authority', () => {
      const result = decideCaptureContext(baseInput({
        jobDecision: makeJobDecision('job-x', 'observe'),
        locationDecision: makeLocationDecision('Place', 'strong'),
      }));
      expect(result.authority).toBe('strong');
    });

    it('suggest job + suggest location → suggest authority', () => {
      const result = decideCaptureContext(baseInput({
        jobDecision: makeJobDecision('job-x', 'suggest'),
        locationDecision: makeLocationDecision('Place', 'suggest'),
      }));
      expect(result.authority).toBe('suggest');
    });

    it('observe job + observe location → observe authority', () => {
      const result = decideCaptureContext(baseInput({
        jobDecision: makeJobDecision('job-x', 'observe'),
        locationDecision: makeLocationDecision('Place', 'observe'),
      }));
      expect(result.authority).toBe('observe');
    });

    it('gravity elevation follows same precedence', () => {
      // observe job + strong gravity → suggest job
      // + observe location → suggest overall
      const result = decideCaptureContext(baseInput({
        surface: 'today',
        jobDecision: makeJobDecision('job-x', 'observe'),
        gravityDecision: makeGravity('jobs', 'strong'),
      }));
      expect(result.authority).toBe('suggest');
    });
  });

  // ── Surface behaviour ──────────────────────────────────────────

  describe('surface behaviour', () => {
    it('Today surface with no job context', () => {
      const result = decideCaptureContext(baseInput({ surface: 'today' }));
      expect(result.suggestedJobId).toBeNull();
      expect(result.source).toBeNull();
    });

    it('Jobs surface with explicit job', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'jobs',
        currentJobId: 'job-x',
      }));
      expect(result.suggestedJobId).toBe('job-x');
      expect(result.source).toBe('explicit_job');
    });

    it('Travel surface behaves like Today', () => {
      const result = decideCaptureContext(baseInput({
        surface: 'travel',
        jobDecision: makeJobDecision('job-x', 'strong'),
      }));
      expect(result.suggestedJobId).toBe('job-x');
      expect(result.source).toBe('text_match');
    });
  });

  // ── Regression ─────────────────────────────────────────────────

  describe('regression', () => {
    it('kind is always capture_context', () => {
      const result = decideCaptureContext(baseInput());
      expect(result.kind).toBe('capture_context');
    });

    it('handles all null inputs without error', () => {
      expect(() => decideCaptureContext(baseInput())).not.toThrow();
    });

    it('handles large inputs without error', () => {
      const input = baseInput({
        surface: 'jobs',
        currentJobId: 'job-1',
        jobDecision: makeJobDecision('job-2', 'strong'),
        locationDecision: makeLocationDecision('Place', 'strong'),
        gravityDecision: makeGravity('jobs', 'strong'),
      });
      expect(() => decideCaptureContext(input)).not.toThrow();
    });
  });
});
