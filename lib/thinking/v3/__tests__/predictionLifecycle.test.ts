import { describe, it, expect } from 'vitest';
import {
  isOpenRow,
  shouldExpireOpen,
  expireOpenPredictions,
  selectOpenPredictionForTaskId,
  assertResolveIdentity,
  supersedeOpenForTask,
  statusAfterOutcome,
  mayTrainDurationFromLifecycle,
  estimateOnlyRate,
  PREDICTION_OPEN_HORIZON_DAYS,
} from '../predictionLifecycle';

function day(offset: number): string {
  const d = new Date('2026-01-15T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString();
}

describe('S4 prediction lifecycle', () => {
  it('open row has null actual and no completed_at', () => {
    expect(
      isOpenRow({ task_id: 't1', logged_at: day(-1), actual_mins: null })
    ).toBe(true);
    expect(
      isOpenRow({
        task_id: 't1',
        actual_mins: 30,
        completed_at: day(0),
        outcome_kind: 'done',
      })
    ).toBe(false);
  });

  it('expires after horizon days', () => {
    const row = {
      id: 'p1',
      task_id: 't1',
      logged_at: day(-20),
      actual_mins: null,
    };
    expect(shouldExpireOpen(row, day(0))).toBe(true);
    expect(shouldExpireOpen(row, day(0), 30)).toBe(false);
    const expired = expireOpenPredictions([row], day(0));
    expect(expired).toHaveLength(1);
    expect(expired[0].lifecycle_status).toBe('expired');
    expect(mayTrainDurationFromLifecycle('expired')).toBe(false);
  });

  it('does not expire recent opens', () => {
    const row = {
      task_id: 't1',
      logged_at: day(-3),
      actual_mins: null,
    };
    expect(shouldExpireOpen(row, day(0))).toBe(false);
  });

  it('selectOpenPredictionForTaskId never uses text', () => {
    const rows = [
      {
        id: 'a',
        task_id: 't1',
        task_text: 'Same title',
        logged_at: day(-2),
        actual_mins: null,
      },
      {
        id: 'b',
        task_id: 't2',
        task_text: 'Same title',
        logged_at: day(-1),
        actual_mins: null,
      },
    ];
    expect(selectOpenPredictionForTaskId(rows, 't1')?.id).toBe('a');
    expect(selectOpenPredictionForTaskId(rows, null)).toBeNull();
    expect(selectOpenPredictionForTaskId(rows, '')).toBeNull();
  });

  it('assertResolveIdentity rejects text-only under default policy', () => {
    const r = assertResolveIdentity({ taskText: 'hello' });
    expect(r.ok).toBe(false);
    const ok = assertResolveIdentity({ taskId: 't1', taskText: 'hello' });
    expect(ok.ok).toBe(true);
  });

  it('supersede open for task', () => {
    const rows = [
      { task_id: 't1', logged_at: day(-1), actual_mins: null },
      { task_id: 't2', logged_at: day(-1), actual_mins: null },
    ];
    const s = supersedeOpenForTask(rows, 't1', day(0));
    expect(s).toHaveLength(1);
    expect(s[0].lifecycle_status).toBe('superseded');
  });

  it('clean outcome may train; dirty may not', () => {
    expect(statusAfterOutcome('done')).toBe('resolved_clean');
    expect(statusAfterOutcome('partial')).toBe('resolved_dirty');
    expect(mayTrainDurationFromLifecycle('resolved_clean')).toBe(true);
    expect(mayTrainDurationFromLifecycle('resolved_dirty')).toBe(false);
  });

  it('estimate-only rate is observability', () => {
    expect(estimateOnlyRate({ totalLogged: 100, resolvedCount: 15 })).toBe(0.85);
  });

  it('horizon default is 14 days', () => {
    expect(PREDICTION_OPEN_HORIZON_DAYS).toBe(14);
  });
});

