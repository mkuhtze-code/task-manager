// lib/thinking/__tests__/evidence.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  logPrediction,
  recordOutcome,
  getBuffer,
  clearBuffer,
  recentOutcomes,
  accuracySummary,
} from '../evidence';

beforeEach(() => {
  clearBuffer();
});

describe('logPrediction', () => {
  it('adds an entry to the buffer', () => {
    logPrediction({
      user_id: 'user-1',
      task_text: 'quote reroof',
      cluster_label: 'quote reroof',
      cluster_count: 5,
      estimated_mins: 30,
      suggested_mins: 45,
      confidence: 'medium',
      actual_mins: null,
      completed_at: null,
    });
    expect(getBuffer()).toHaveLength(1);
  });

  it('sets logged_at to current timestamp', () => {
    const before = Date.now();
    const entry = logPrediction({
      user_id: 'user-1',
      task_text: 'task',
      cluster_label: null,
      cluster_count: 0,
      estimated_mins: 15,
      suggested_mins: null,
      confidence: 'low',
      actual_mins: null,
      completed_at: null,
    });
    const after = Date.now();
    const ts = new Date(entry.logged_at).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('prepends to buffer (most recent first)', () => {
    logPrediction({
      user_id: 'user-1', task_text: 'first', cluster_label: null,
      cluster_count: 0, estimated_mins: 10, suggested_mins: null,
      confidence: 'low', actual_mins: null, completed_at: null,
    });
    logPrediction({
      user_id: 'user-1', task_text: 'second', cluster_label: null,
      cluster_count: 0, estimated_mins: 20, suggested_mins: null,
      confidence: 'low', actual_mins: null, completed_at: null,
    });
    const buffer = getBuffer();
    expect(buffer[0].task_text).toBe('second');
    expect(buffer[1].task_text).toBe('first');
  });

  it('caps buffer at MAX_BUFFER_SIZE', () => {
    for (let i = 0; i < 250; i++) {
      logPrediction({
        user_id: 'user-1', task_text: `task ${i}`, cluster_label: null,
        cluster_count: 0, estimated_mins: 10, suggested_mins: null,
        confidence: 'low', actual_mins: null, completed_at: null,
      });
    }
    expect(getBuffer().length).toBeLessThanOrEqual(200);
  });
});

describe('recordOutcome', () => {
  it('fills in actual_mins on the most recent matching prediction', () => {
    logPrediction({
      user_id: 'user-1', task_text: 'quote reroof', cluster_label: 'quote reroof',
      cluster_count: 5, estimated_mins: 30, suggested_mins: 45,
      confidence: 'medium', actual_mins: null, completed_at: null,
    });
    recordOutcome('quote reroof', 50);
    const buffer = getBuffer();
    expect(buffer[0].actual_mins).toBe(50);
    expect(buffer[0].completed_at).not.toBeNull();
  });

  it('does not modify entries with different task text', () => {
    logPrediction({
      user_id: 'user-1', task_text: 'task A', cluster_label: null,
      cluster_count: 0, estimated_mins: 10, suggested_mins: null,
      confidence: 'low', actual_mins: null, completed_at: null,
    });
    recordOutcome('task B', 20);
    expect(getBuffer()[0].actual_mins).toBeNull();
  });

  it('only fills the first unmatched entry', () => {
    logPrediction({
      user_id: 'user-1', task_text: 'task', cluster_label: null,
      cluster_count: 0, estimated_mins: 10, suggested_mins: null,
      confidence: 'low', actual_mins: null, completed_at: null,
    });
    logPrediction({
      user_id: 'user-1', task_text: 'task', cluster_label: null,
      cluster_count: 0, estimated_mins: 20, suggested_mins: null,
      confidence: 'low', actual_mins: null, completed_at: null,
    });
    recordOutcome('task', 30);
    const buffer = getBuffer();
    // Most recent (index 0) gets filled, older one stays null
    expect(buffer[0].actual_mins).toBe(30);
    expect(buffer[1].actual_mins).toBeNull();
  });
});

describe('recentOutcomes', () => {
  it('returns only completed predictions', () => {
    logPrediction({
      user_id: 'user-1', task_text: 'completed', cluster_label: null,
      cluster_count: 0, estimated_mins: 10, suggested_mins: null,
      confidence: 'low', actual_mins: null, completed_at: null,
    });
    logPrediction({
      user_id: 'user-1', task_text: 'pending', cluster_label: null,
      cluster_count: 0, estimated_mins: 20, suggested_mins: null,
      confidence: 'low', actual_mins: null, completed_at: null,
    });
    recordOutcome('completed', 15);
    const outcomes = recentOutcomes(getBuffer());
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].task_text).toBe('completed');
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      logPrediction({
        user_id: 'user-1', task_text: `task ${i}`, cluster_label: null,
        cluster_count: 0, estimated_mins: 10, suggested_mins: null,
        confidence: 'low', actual_mins: null, completed_at: null,
      });
      recordOutcome(`task ${i}`, 15);
    }
    const outcomes = recentOutcomes(getBuffer(), 5);
    expect(outcomes).toHaveLength(5);
  });
});

describe('accuracySummary', () => {
  it('returns defaults for empty buffer', () => {
    const summary = accuracySummary([]);
    expect(summary.totalPredictions).toBe(0);
    expect(summary.completedPredictions).toBe(0);
    expect(summary.averageError).toBe(0);
    expect(summary.averageRatio).toBe(1);
  });

  it('computes accuracy summary correctly', () => {
    // Task A: estimated 30, actual 40 → error 10, ratio 1.33
    logPrediction({
      user_id: 'user-1', task_text: 'A', cluster_label: null,
      cluster_count: 0, estimated_mins: 30, suggested_mins: null,
      confidence: 'low', actual_mins: null, completed_at: null,
    });
    recordOutcome('A', 40);

    // Task B: estimated 20, actual 15 → error 5, ratio 0.75
    logPrediction({
      user_id: 'user-1', task_text: 'B', cluster_label: null,
      cluster_count: 0, estimated_mins: 20, suggested_mins: null,
      confidence: 'low', actual_mins: null, completed_at: null,
    });
    recordOutcome('B', 15);

    const summary = accuracySummary(getBuffer());
    expect(summary.totalPredictions).toBe(2);
    expect(summary.completedPredictions).toBe(2);
    expect(summary.averageError).toBe(8); // (10 + 5) / 2 = 7.5 → 8 (rounded)
    expect(summary.overEstimates).toBe(1); // A took longer
    expect(summary.underEstimates).toBe(1); // B took shorter
  });
});
