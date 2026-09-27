import { describe, it, expect, beforeEach } from 'vitest';
import {
  logPrediction,
  recordOutcome,
  getBuffer,
  clearBuffer,
  resolveOpenPrediction,
} from '../evidence';

describe('evidence identity (phase 2)', () => {
  beforeEach(() => clearBuffer());

  it('recordOutcome prefers task_id over matching text', () => {
    logPrediction({
      user_id: 'u1',
      task_id: 'task-a',
      task_text: 'Same title',
      cluster_label: null,
      cluster_count: 0,
      estimated_mins: 30,
      suggested_mins: 28,
      confidence: 'low',
      actual_mins: null,
      completed_at: null,
      outcome_kind: null,
      model_version: '3.0.0-phase2',
      algorithm_version: '3.0.0-phase2',
      feature_version: '3.0.0-phase2',
      decision_id: null,
    });
    logPrediction({
      user_id: 'u1',
      task_id: 'task-b',
      task_text: 'Same title',
      cluster_label: null,
      cluster_count: 0,
      estimated_mins: 40,
      suggested_mins: 35,
      confidence: 'medium',
      actual_mins: null,
      completed_at: null,
      outcome_kind: null,
      model_version: '3.0.0-phase2',
      algorithm_version: '3.0.0-phase2',
      feature_version: '3.0.0-phase2',
      decision_id: null,
    });

    recordOutcome({ taskId: 'task-b', taskText: 'Same title', actualMins: 42 });

    const buf = getBuffer();
    const a = buf.find((e) => e.task_id === 'task-a');
    const b = buf.find((e) => e.task_id === 'task-b');
    expect(a?.actual_mins).toBeNull();
    expect(b?.actual_mins).toBe(42);
  });

  it('recordOutcome falls back to text when task_id missing', () => {
    logPrediction({
      user_id: 'u1',
      task_id: null,
      task_text: 'Legacy only',
      cluster_label: null,
      cluster_count: 1,
      estimated_mins: 20,
      suggested_mins: null,
      confidence: 'low',
      actual_mins: null,
      completed_at: null,
      outcome_kind: null,
      model_version: null,
      algorithm_version: null,
      feature_version: null,
      decision_id: null,
    });
    recordOutcome({ taskText: 'Legacy only', actualMins: 18 });
    expect(getBuffer()[0].actual_mins).toBe(18);
  });

  it('resolveOpenPrediction updates buffer in test env', async () => {
    logPrediction({
      user_id: 'u1',
      task_id: 't9',
      task_text: 'Measure site',
      cluster_label: 'measure',
      cluster_count: 3,
      estimated_mins: 60,
      suggested_mins: 55,
      confidence: 'medium',
      actual_mins: null,
      completed_at: null,
      outcome_kind: null,
      model_version: '3.0.0-phase2',
      algorithm_version: '3.0.0-phase2',
      feature_version: '3.0.0-phase2',
      decision_id: null,
    });
    const resolved = await resolveOpenPrediction({
      userId: 'u1',
      taskId: 't9',
      actualMins: 70,
      outcomeKind: 'done',
    });
    expect(resolved?.actual_mins).toBe(70);
    expect(resolved?.outcome_kind).toBe('done');
  });
});
