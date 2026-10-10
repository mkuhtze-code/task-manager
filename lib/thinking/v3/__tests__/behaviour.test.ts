import { describe, it, expect } from 'vitest';
import {
  buildUserBehaviourModel,
  behaviourSamplesFromHistory,
} from '../behaviour';
import { closeCompletionLoop } from '../../evidence/closeCompletionLoop';

describe('closeCompletionLoop episode gate', () => {
  it('blocks duration training when interruption contaminates measured elapsed', () => {
    const result = closeCompletionLoop({
      userId: 'u1',
      taskId: 't1',
      taskText: 'Site measure access',
      estimateMins: 30,
      measuredMins: 180,
      history: [],
      clusters: [],
      startedAt: '2026-01-01T09:00:00Z',
      completedAt: '2026-01-01T12:00:00Z',
      interruptionMinutes: 120,
      outcomeKind: 'done',
    });
    expect(result.durationTrainingBlocked).toBe(true);
    expect(result.trainMins).toBeNull();
    expect(result.episode?.durationEvidence).toBe('contaminated');
  });

  it('trains on active minutes when active is known despite interruption', () => {
    const result = closeCompletionLoop({
      userId: 'u1',
      taskId: 't2',
      taskText: 'Write proposal',
      estimateMins: 30,
      measuredMins: 90,
      history: [],
      clusters: [],
      startedAt: '2026-01-01T10:00:00Z',
      completedAt: '2026-01-01T11:30:00Z',
      activeMinutes: 25,
      interruptionMinutes: 65,
      outcomeKind: 'done',
    });
    expect(result.durationTrainingBlocked).toBeFalsy();
    expect(result.trainMins).toBe(25);
    expect(result.episode?.durationEvidence).toBe('active_measured');
  });

  it('still trains normal measured completions without interruption signals', () => {
    const result = closeCompletionLoop({
      userId: 'u1',
      taskId: 't3',
      taskText: 'Invoice client',
      estimateMins: 20,
      measuredMins: 22,
      history: [],
      clusters: [],
      outcomeKind: 'done',
    });
    expect(result.trainMins).toBe(22);
    expect(result.source).toBe('measured');
  });
});

describe('buildUserBehaviourModel', () => {
  it('detects underestimate bias and carry-heavy behaviour', () => {
    const samples = behaviourSamplesFromHistory([
      {
        text: 'Site measure access',
        actual_mins: 60,
        estimate_mins: 30,
        created_at: '2026-01-01T09:00:00Z',
        completed_at: '2026-01-03T09:00:00Z',
      },
      {
        text: 'Site measure access',
        actual_mins: 55,
        estimate_mins: 30,
        created_at: '2026-01-05T09:00:00Z',
        completed_at: '2026-01-07T09:00:00Z',
      },
      {
        text: 'Site measure access',
        actual_mins: 50,
        estimate_mins: 30,
        created_at: '2026-01-10T09:00:00Z',
        completed_at: '2026-01-12T09:00:00Z',
      },
      {
        text: 'Quick email reply',
        actual_mins: 10,
        estimate_mins: 10,
        created_at: '2026-01-02T10:00:00Z',
        completed_at: '2026-01-02T10:15:00Z',
      },
      {
        text: 'Quick email reply',
        actual_mins: 12,
        estimate_mins: 10,
        created_at: '2026-01-04T10:00:00Z',
        completed_at: '2026-01-04T10:20:00Z',
      },
    ]);

    const model = buildUserBehaviourModel({
      userId: 'u1',
      samples,
      updatedAt: '2026-01-15T00:00:00Z',
    });

    expect(model.calibrationSampleCount).toBeGreaterThanOrEqual(3);
    expect(model.estimationLogBias).not.toBeNull();
    expect(model.estimationLogBias!).toBeGreaterThan(0);
    expect(model.carryRate).not.toBeNull();
    expect(model.carryRate!).toBeGreaterThan(0.3);
  }, 15_000); // Avoid false failures when deterministic clustering tests run on a contended CI worker.

  it('excludes contaminated samples from duration bias', () => {
    const samples = [
      {
        text: 'Call client',
        actualMins: 200,
        estimateMins: 20,
        createdAt: '2026-01-01T09:00:00Z',
        completedAt: '2026-01-01T12:00:00Z',
        durationContaminated: true,
      },
      {
        text: 'Call client',
        actualMins: 25,
        estimateMins: 20,
        createdAt: '2026-01-02T09:00:00Z',
        completedAt: '2026-01-02T09:30:00Z',
      },
      {
        text: 'Call client',
        actualMins: 22,
        estimateMins: 20,
        createdAt: '2026-01-03T09:00:00Z',
        completedAt: '2026-01-03T09:25:00Z',
      },
    ];
    const model = buildUserBehaviourModel({
      userId: 'u1',
      samples,
      updatedAt: '2026-01-15T00:00:00Z',
    });
    expect(model.calibrationSampleCount).toBe(2);
    expect(Math.abs(model.estimationLogBias ?? 0)).toBeLessThan(0.5);
  });
});
