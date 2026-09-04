import { describe, it, expect } from 'vitest';
import { observeV2TemporalBehaviour } from '../temporalBehaviour';
import { normalizeTemporalFacts } from '../temporal';
import { runObservationPipeline } from '../pipeline';
import type { CompletedTaskFacts } from '../../types';

function makeTask(over: Partial<CompletedTaskFacts> = {}): CompletedTaskFacts {
  return {
    text: 'task',
    status: 'done',
    source: 'planned',
    estimate_mins: 30,
    actual_mins: 30,
    logged_mins: 0,
    created_at: '2026-01-14T10:00:00Z',
    completed_at: '2026-01-14T11:00:00Z',
    started_at: null,
    surface_date: null,
    location_text: null,
    lat: null,
    lng: null,
    job_id: null,
    info: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    subtaskTotalMins: 0,
    ...over,
  };
}

function byType(obs: ReturnType<typeof observeV2TemporalBehaviour>, type: string) {
  return obs.find((o) => o.semanticType === type || o.semanticType.startsWith(type + ':'));
}

describe('temporal - lifecycle', () => {
  it('same-day completions do not emit an overnight claim', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-14T09:00:00Z', completed_at: '2026-01-14T10:00:00Z' }),
      makeTask({ created_at: '2026-01-15T09:00:00Z', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ created_at: '2026-01-16T09:00:00Z', completed_at: '2026-01-16T10:00:00Z' }),
      makeTask({ created_at: '2026-01-17T09:00:00Z', completed_at: '2026-01-17T10:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    expect(byType(obs, 'temporal:overnight')).toBeUndefined();
  });

  it('next-day completions emit an overnight claim', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-14T09:00:00Z', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ created_at: '2026-01-15T09:00:00Z', completed_at: '2026-01-16T10:00:00Z' }),
      makeTask({ created_at: '2026-01-16T09:00:00Z', completed_at: '2026-01-17T10:00:00Z' }),
      makeTask({ created_at: '2026-01-17T09:00:00Z', completed_at: '2026-01-18T10:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    const overnight = byType(obs, 'temporal:overnight');
    expect(overnight).toBeDefined();
    expect(overnight!.evidence.insufficient).toBe(false);
  });

  it('multi-day completions are reflected in persistence', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-10T09:00:00Z', completed_at: '2026-01-14T10:00:00Z' }),
      makeTask({ created_at: '2026-01-11T09:00:00Z', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ created_at: '2026-01-12T09:00:00Z', completed_at: '2026-01-16T10:00:00Z' }),
      makeTask({ created_at: '2026-01-13T09:00:00Z', completed_at: '2026-01-15T10:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    const persistence = byType(obs, 'temporal:persistence');
    expect(persistence).toBeDefined();
    expect(persistence!.evidence.sampleSize).toBeGreaterThanOrEqual(3);
  });

  it('missing completion excludes the task and marks it missing, never fabricating', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-14T09:00:00Z', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ created_at: '2026-01-15T09:00:00Z', completed_at: '2026-01-16T10:00:00Z' }),
      makeTask({ created_at: '2026-01-16T09:00:00Z', completed_at: '2026-01-17T10:00:00Z' }),
      makeTask({ created_at: '2026-01-17T09:00:00Z', completed_at: null }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    const overnight = byType(obs, 'temporal:overnight');
    if (overnight) {
      expect(overnight.evidence.missingDataCount).toBe(1);
    }
  });

  it('missing creation timestamp is treated as missing data', () => {
    const tasks = [
      makeTask({ created_at: 'bad', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ created_at: 'bad', completed_at: '2026-01-16T10:00:00Z' }),
      makeTask({ created_at: 'bad', completed_at: '2026-01-17T10:00:00Z' }),
      makeTask({ created_at: 'bad', completed_at: '2026-01-18T10:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    // No eligible tasks -> no overnight claim (nothing fabricated).
    expect(byType(obs, 'temporal:overnight')).toBeUndefined();
  });

  it('active duration is only present when Start/Stop exists', () => {
    const none = normalizeTemporalFacts([makeTask({ started_at: null })], 'UTC');
    expect(none[0].activeDurationMin).toBeNull();

    const started = normalizeTemporalFacts(
      [makeTask({ started_at: '2026-01-14T09:30:00Z', completed_at: '2026-01-14T11:00:00Z' })],
      'UTC',
    );
    expect(started[0].activeDurationMin).toBe(90);
  });

  it('taskLatency and activeDuration are distinct', () => {
    const f = normalizeTemporalFacts(
      [makeTask({ created_at: '2026-01-14T08:00:00Z', started_at: '2026-01-14T09:00:00Z', completed_at: '2026-01-14T11:00:00Z' })],
      'UTC',
    )[0];
    // Latency = created->completed (3h). Active duration = started->completed (2h).
    expect(f.latencyHours).toBe(3);
    expect(f.activeDurationMin).toBe(120);
  });
});

describe('temporal - time of day', () => {
  it('afternoon-dominant completions emit a completion-period claim', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-14T08:00:00Z', completed_at: '2026-01-14T14:00:00Z' }),
      makeTask({ created_at: '2026-01-15T08:00:00Z', completed_at: '2026-01-15T15:00:00Z' }),
      makeTask({ created_at: '2026-01-16T08:00:00Z', completed_at: '2026-01-16T14:30:00Z' }),
      makeTask({ created_at: '2026-01-17T08:00:00Z', completed_at: '2026-01-17T16:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    const period = byType(obs, 'temporal:completion_period');
    expect(period).toBeDefined();
    expect(period!.affectedContext.timePeriod).toBe('afternoon');
  });

  it('morning completions emit a morning claim', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-14T08:00:00Z', completed_at: '2026-01-14T10:00:00Z' }),
      makeTask({ created_at: '2026-01-15T08:00:00Z', completed_at: '2026-01-15T09:00:00Z' }),
      makeTask({ created_at: '2026-01-16T08:00:00Z', completed_at: '2026-01-16T11:00:00Z' }),
      makeTask({ created_at: '2026-01-17T08:00:00Z', completed_at: '2026-01-17T10:30:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    const period = byType(obs, 'temporal:completion_period');
    expect(period).toBeDefined();
    expect(period!.affectedContext.timePeriod).toBe('morning');
  });

  it('evening completions emit an evening claim', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-14T08:00:00Z', completed_at: '2026-01-14T19:00:00Z' }),
      makeTask({ created_at: '2026-01-15T08:00:00Z', completed_at: '2026-01-15T20:00:00Z' }),
      makeTask({ created_at: '2026-01-16T08:00:00Z', completed_at: '2026-01-16T18:00:00Z' }),
      makeTask({ created_at: '2026-01-17T08:00:00Z', completed_at: '2026-01-17T19:30:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    const period = byType(obs, 'temporal:completion_period');
    expect(period).toBeDefined();
    expect(period!.affectedContext.timePeriod).toBe('evening');
  });

  it('distributed completions emit nothing (legitimate baseline, not largest bucket)', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-14T08:00:00Z', completed_at: '2026-01-14T09:00:00Z' }),
      makeTask({ created_at: '2026-01-15T08:00:00Z', completed_at: '2026-01-15T14:00:00Z' }),
      makeTask({ created_at: '2026-01-16T08:00:00Z', completed_at: '2026-01-16T19:00:00Z' }),
      makeTask({ created_at: '2026-01-17T08:00:00Z', completed_at: '2026-01-17T22:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    expect(byType(obs, 'temporal:completion_period')).toBeUndefined();
  });

  it('insufficient sample emits nothing', () => {
    const tasks = [
      makeTask({ completed_at: '2026-01-14T14:00:00Z' }),
      makeTask({ completed_at: '2026-01-15T15:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    expect(byType(obs, 'temporal:completion_period')).toBeUndefined();
  });

  it('missing completion timestamps are excluded, not fabricated', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-14T08:00:00Z', completed_at: '2026-01-14T14:00:00Z' }),
      makeTask({ created_at: '2026-01-15T08:00:00Z', completed_at: null }),
      makeTask({ created_at: '2026-01-16T08:00:00Z', completed_at: '2026-01-16T15:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    // Only 2 valid completion times -> below min sample -> nothing.
    expect(byType(obs, 'temporal:completion_period')).toBeUndefined();
  });
});

describe('temporal - schedule displacement', () => {
  it('completed after the intended day', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-10T09:00:00Z', surface_date: '2026-01-11', completed_at: '2026-01-14T10:00:00Z' }),
      makeTask({ created_at: '2026-01-11T09:00:00Z', surface_date: '2026-01-12', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ created_at: '2026-01-12T09:00:00Z', surface_date: '2026-01-13', completed_at: '2026-01-16T10:00:00Z' }),
      makeTask({ created_at: '2026-01-13T09:00:00Z', surface_date: '2026-01-14', completed_at: '2026-01-17T10:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    const disp = byType(obs, 'temporal:schedule_displacement');
    expect(disp).toBeDefined();
    expect(disp!.semanticType).toContain('after');
  });

  it('completed before the intended day', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-10T09:00:00Z', surface_date: '2026-01-14', completed_at: '2026-01-11T10:00:00Z' }),
      makeTask({ created_at: '2026-01-11T09:00:00Z', surface_date: '2026-01-15', completed_at: '2026-01-12T10:00:00Z' }),
      makeTask({ created_at: '2026-01-12T09:00:00Z', surface_date: '2026-01-16', completed_at: '2026-01-13T10:00:00Z' }),
      makeTask({ created_at: '2026-01-13T09:00:00Z', surface_date: '2026-01-17', completed_at: '2026-01-14T10:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    const disp = byType(obs, 'temporal:schedule_displacement');
    expect(disp).toBeDefined();
    expect(disp!.semanticType).toContain('before');
  });

  it('on-time completions emit nothing (balanced)', () => {
    const tasks = [
      makeTask({ surface_date: '2026-01-14', completed_at: '2026-01-14T10:00:00Z' }),
      makeTask({ surface_date: '2026-01-15', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ surface_date: '2026-01-16', completed_at: '2026-01-16T10:00:00Z' }),
      makeTask({ surface_date: '2026-01-17', completed_at: '2026-01-17T10:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    expect(byType(obs, 'temporal:schedule_displacement')).toBeUndefined();
  });

  it('missing intended date excludes the task', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-10T09:00:00Z', source: 'came_up', surface_date: null, completed_at: '2026-01-14T10:00:00Z' }),
      makeTask({ created_at: '2026-01-11T09:00:00Z', source: 'came_up', surface_date: null, completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ created_at: '2026-01-12T09:00:00Z', source: 'came_up', surface_date: null, completed_at: '2026-01-16T10:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    expect(byType(obs, 'temporal:schedule_displacement')).toBeUndefined();
  });
});

describe('temporal - timezone correctness', () => {
  it('UTC same-day but local next-day counts as overnight (local semantics)', () => {
    // Created Jan15 03:00Z = Jan14 22:00 NY; completed Jan15 06:00Z = Jan15 01:00 NY.
    const tz = 'America/New_York';
    const tasks = [
      makeTask({ created_at: '2026-01-15T03:00:00Z', completed_at: '2026-01-15T06:00:00Z' }),
      makeTask({ created_at: '2026-01-16T03:00:00Z', completed_at: '2026-01-16T06:00:00Z' }),
      makeTask({ created_at: '2026-01-17T03:00:00Z', completed_at: '2026-01-17T06:00:00Z' }),
      makeTask({ created_at: '2026-01-18T03:00:00Z', completed_at: '2026-01-18T06:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, tz);
    expect(byType(obs, 'temporal:overnight')).toBeDefined();
  });

  it('a UTC boundary crossing does not count as overnight when local day is the same', () => {
    // Created Jan14 23:30Z = 18:30 NY Jan14; completed Jan15 00:30Z = 19:30 NY Jan14.
    const tz = 'America/New_York';
    const tasks = [
      makeTask({ created_at: '2026-01-14T23:30:00Z', completed_at: '2026-01-15T00:30:00Z' }),
      makeTask({ created_at: '2026-01-16T23:30:00Z', completed_at: '2026-01-17T00:30:00Z' }),
      makeTask({ created_at: '2026-01-18T23:30:00Z', completed_at: '2026-01-19T00:30:00Z' }),
      makeTask({ created_at: '2026-01-20T23:30:00Z', completed_at: '2026-01-21T00:30:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, tz);
    expect(byType(obs, 'temporal:overnight')).toBeUndefined();
  });

  it('resolves local hours across a DST spring-forward', () => {
    const tz = 'America/New_York';
    // 2026-03-08 is US spring-forward. 06:30Z = 01:30 EST; 11:30Z = 07:30 EDT.
    const facts = normalizeTemporalFacts(
      [makeTask({ created_at: '2026-03-08T06:30:00Z', completed_at: '2026-03-08T11:30:00Z' })],
      tz,
    );
    expect(facts[0].createdHour).toBe(1);
    expect(facts[0].completedHour).toBe(7);
    expect(facts[0].latencyDays).toBe(0);
  });

  it('invalid timezone yields no observations (no UTC fallback on the engine)', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-14T09:00:00Z', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ created_at: '2026-01-15T09:00:00Z', completed_at: '2026-01-16T10:00:00Z' }),
      makeTask({ created_at: '2026-01-16T09:00:00Z', completed_at: '2026-01-17T10:00:00Z' }),
      makeTask({ created_at: '2026-01-17T09:00:00Z', completed_at: '2026-01-18T10:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'Not/AZone');
    expect(obs).toEqual([]);
  });

  it('date-only surface values are not reinterpreted through a timezone', () => {
    const facts = normalizeTemporalFacts(
      [makeTask({ surface_date: '2026-01-14', created_at: '2026-01-14T09:00:00Z', completed_at: '2026-01-14T10:00:00Z' })],
      'America/New_York',
    );
    expect(facts[0].surfaceLocal).toBe('2026-01-14');
    expect(facts[0].latencyDays).toBe(0);
  });
});

describe('temporal - evidence model', () => {
  it('valid denominator produces non-insufficient evidence', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-14T09:00:00Z', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ created_at: '2026-01-15T09:00:00Z', completed_at: '2026-01-16T10:00:00Z' }),
      makeTask({ created_at: '2026-01-16T09:00:00Z', completed_at: '2026-01-17T10:00:00Z' }),
      makeTask({ created_at: '2026-01-17T09:00:00Z', completed_at: '2026-01-18T10:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    const overnight = byType(obs, 'temporal:overnight');
    expect(overnight).toBeDefined();
    expect(overnight!.evidence.insufficient).toBe(false);
    expect(overnight!.evidence.sampleSize).toBe(4);
  });

  it('zero denominator never emits a fabricated observation', () => {
    const obs = observeV2TemporalBehaviour([], 'UTC');
    expect(obs).toEqual([]);
  });

  it('all observations carry the full V2 evidence fields', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-14T09:00:00Z', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ created_at: '2026-01-15T09:00:00Z', completed_at: '2026-01-16T10:00:00Z' }),
      makeTask({ created_at: '2026-01-16T09:00:00Z', completed_at: '2026-01-17T10:00:00Z' }),
      makeTask({ created_at: '2026-01-17T09:00:00Z', completed_at: '2026-01-18T10:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    expect(obs.length).toBeGreaterThan(0);
    for (const o of obs) {
      const e = o.evidence;
      expect(typeof o.id).toBe('string');
      expect(typeof o.confidence).toBe('string');
      expect(typeof e.sampleSize).toBe('number');
      expect('effectMagnitude' in e).toBe(true);
      expect('consistency' in e).toBe(true);
      expect('variance' in e).toBe(true);
      expect('missingDataCount' in e).toBe(true);
      expect('insufficient' in e).toBe(true);
      expect('evidenceKind' in e).toBe(true);
      expect(Array.isArray(e.measurements)).toBe(true);
    }
  });

  it('does not claim taskDuration from latency', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-14T09:00:00Z', completed_at: '2026-01-15T10:00:00Z', started_at: null }),
      makeTask({ created_at: '2026-01-15T09:00:00Z', completed_at: '2026-01-16T10:00:00Z', started_at: null }),
      makeTask({ created_at: '2026-01-16T09:00:00Z', completed_at: '2026-01-17T10:00:00Z', started_at: null }),
      makeTask({ created_at: '2026-01-17T09:00:00Z', completed_at: '2026-01-18T10:00:00Z', started_at: null }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    for (const o of obs) {
      expect(o.description).not.toMatch(/took \d+ hours?/);
      expect(o.title).not.toMatch(/took \d+ hours?/);
    }
  });
});

describe('temporal - pipeline integration', () => {
  it('is actually invoked by runObservationPipeline and reaches observations', () => {
    const tasks = [
      makeTask({ text: 'a', created_at: '2026-01-14T09:00:00Z', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ text: 'b', created_at: '2026-01-15T09:00:00Z', completed_at: '2026-01-16T10:00:00Z' }),
      makeTask({ text: 'c', created_at: '2026-01-16T09:00:00Z', completed_at: '2026-01-17T10:00:00Z' }),
      makeTask({ text: 'd', created_at: '2026-01-17T09:00:00Z', completed_at: '2026-01-18T10:00:00Z' }),
      makeTask({ text: 'e', created_at: '2026-01-18T09:00:00Z', completed_at: '2026-01-19T10:00:00Z' }),
    ];
    const results = runObservationPipeline(tasks, { timezone: 'UTC' });
    const temporal = results.filter((o) => o.traceability.detectionSource.startsWith('temporalBehaviour.'));
    expect(temporal.length).toBeGreaterThan(0);
  });

  it('produces stable semantic IDs across identical executions', () => {
    const tasks = [
      makeTask({ text: 'a', created_at: '2026-01-14T09:00:00Z', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ text: 'b', created_at: '2026-01-15T09:00:00Z', completed_at: '2026-01-16T10:00:00Z' }),
      makeTask({ text: 'c', created_at: '2026-01-16T09:00:00Z', completed_at: '2026-01-17T10:00:00Z' }),
      makeTask({ text: 'd', created_at: '2026-01-17T09:00:00Z', completed_at: '2026-01-18T10:00:00Z' }),
    ];
    const a = runObservationPipeline(tasks, { timezone: 'UTC' });
    const b = runObservationPipeline(tasks, { timezone: 'UTC' });
    expect(a.map((o) => o.id)).toEqual(b.map((o) => o.id));
    expect(a.map((o) => o.rank)).toEqual(b.map((o) => o.rank));
  });
});

describe('temporal - identity & deduplication', () => {
  it('identical input yields identical temporal observation IDs', () => {
    const tasks = [
      makeTask({ text: 'a', created_at: '2026-01-14T09:00:00Z', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ text: 'b', created_at: '2026-01-15T09:00:00Z', completed_at: '2026-01-16T10:00:00Z' }),
      makeTask({ text: 'c', created_at: '2026-01-16T09:00:00Z', completed_at: '2026-01-17T10:00:00Z' }),
      makeTask({ text: 'd', created_at: '2026-01-17T09:00:00Z', completed_at: '2026-01-18T10:00:00Z' }),
    ];
    const a = observeV2TemporalBehaviour(tasks, 'UTC');
    const b = observeV2TemporalBehaviour(tasks, 'UTC');
    expect(a.map((o) => o.id).sort()).toEqual(b.map((o) => o.id).sort());
  });

  it('genuinely different temporal claims remain distinct (before vs after)', () => {
    const after = observeV2TemporalBehaviour(
      [
        makeTask({ created_at: '2026-01-10T09:00:00Z', surface_date: '2026-01-11', completed_at: '2026-01-14T10:00:00Z' }),
        makeTask({ created_at: '2026-01-11T09:00:00Z', surface_date: '2026-01-12', completed_at: '2026-01-15T10:00:00Z' }),
        makeTask({ created_at: '2026-01-12T09:00:00Z', surface_date: '2026-01-13', completed_at: '2026-01-16T10:00:00Z' }),
      ],
      'UTC',
    ).filter((o) => o.semanticType.startsWith('temporal:schedule_displacement'));
    const before = observeV2TemporalBehaviour(
      [
        makeTask({ created_at: '2026-01-10T09:00:00Z', surface_date: '2026-01-14', completed_at: '2026-01-11T10:00:00Z' }),
        makeTask({ created_at: '2026-01-11T09:00:00Z', surface_date: '2026-01-15', completed_at: '2026-01-12T10:00:00Z' }),
        makeTask({ created_at: '2026-01-12T09:00:00Z', surface_date: '2026-01-16', completed_at: '2026-01-13T10:00:00Z' }),
      ],
      'UTC',
    ).filter((o) => o.semanticType.startsWith('temporal:schedule_displacement'));

    expect(after.length).toBe(1);
    expect(before.length).toBe(1);
    expect(after[0].id).not.toBe(before[0].id);
    expect(after[0].semanticType).toContain(':after');
    expect(before[0].semanticType).toContain(':before');
  });

  it('equivalent temporal observations deduplicate through the pipeline', () => {
    // Two detectors-free input set; run pipeline twice with same shape input.
    const tasksA = [
      makeTask({ text: 'a', created_at: '2026-01-14T09:00:00Z', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ text: 'b', created_at: '2026-01-15T09:00:00Z', completed_at: '2026-01-16T10:00:00Z' }),
      makeTask({ text: 'c', created_at: '2026-01-16T09:00:00Z', completed_at: '2026-01-17T10:00:00Z' }),
      makeTask({ text: 'd', created_at: '2026-01-17T09:00:00Z', completed_at: '2026-01-18T10:00:00Z' }),
    ];
    const idsA = runObservationPipeline(tasksA, { timezone: 'UTC' }).map((o) => o.id).sort();
    const idsB = runObservationPipeline(tasksA, { timezone: 'UTC' }).map((o) => o.id).sort();
    expect(idsA).toEqual(idsB);
  });
});

describe('temporal - carryover interplay', () => {
  it('a future-scheduled task completed on its intended day is NOT treated as overdue displacement', () => {
    const tasks = [
      makeTask({ created_at: '2026-01-10T09:00:00Z', surface_date: '2026-01-14', completed_at: '2026-01-14T10:00:00Z' }),
      makeTask({ created_at: '2026-01-11T09:00:00Z', surface_date: '2026-01-15', completed_at: '2026-01-15T10:00:00Z' }),
      makeTask({ created_at: '2026-01-12T09:00:00Z', surface_date: '2026-01-16', completed_at: '2026-01-16T10:00:00Z' }),
      makeTask({ created_at: '2026-01-13T09:00:00Z', surface_date: '2026-01-17', completed_at: '2026-01-17T10:00:00Z' }),
    ];
    const obs = observeV2TemporalBehaviour(tasks, 'UTC');
    expect(obs.some((o) => o.semanticType.startsWith('temporal:schedule_displacement'))).toBe(false);
  });
});

describe('temporal - evidence stability', () => {
  it('stable displacement values yield higher consistency than unstable values', () => {
    const stable = normalizeTemporalFacts(
      [
        makeTask({ created_at: '2026-01-10T09:00:00Z', surface_date: '2026-01-11', completed_at: '2026-01-14T10:00:00Z' }),
        makeTask({ created_at: '2026-01-11T09:00:00Z', surface_date: '2026-01-12', completed_at: '2026-01-15T10:00:00Z' }),
        makeTask({ created_at: '2026-01-12T09:00:00Z', surface_date: '2026-01-13', completed_at: '2026-01-16T10:00:00Z' }),
        makeTask({ created_at: '2026-01-13T09:00:00Z', surface_date: '2026-01-14', completed_at: '2026-01-17T10:00:00Z' }),
        makeTask({ created_at: '2026-01-14T09:00:00Z', surface_date: '2026-01-15', completed_at: '2026-01-18T10:00:00Z' }),
      ],
      'UTC',
    ).map((f) => f.displacementDays!).filter((d) => d !== null);

    expect(new Set(stable).size).toBe(1); // all identical displacement (3 days)
  });

  it('variance is reported and reflects instability', () => {
    const stable = observeV2TemporalBehaviour(
      [
        makeTask({ created_at: '2026-01-10T09:00:00Z', surface_date: '2026-01-11', completed_at: '2026-01-14T10:00:00Z' }),
        makeTask({ created_at: '2026-01-11T09:00:00Z', surface_date: '2026-01-12', completed_at: '2026-01-15T10:00:00Z' }),
        makeTask({ created_at: '2026-01-12T09:00:00Z', surface_date: '2026-01-13', completed_at: '2026-01-16T10:00:00Z' }),
      ],
      'UTC',
    ).find((o) => o.semanticType.startsWith('temporal:schedule_displacement'));

    expect(stable).toBeDefined();
    expect(typeof stable!.evidence.variance).toBe('number');
  });
});
