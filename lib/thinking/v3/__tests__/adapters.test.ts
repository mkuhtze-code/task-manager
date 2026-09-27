import { describe, it, expect } from 'vitest';
import {
  confidenceProfileFromV1,
  emptyContextSnapshot,
  taskFactFromCompleted,
  taskFactFromHistorical,
  predictionFromLogEntry,
  outcomeFromCompletion,
  pointDistribution,
  minimalEvidence,
  currentVersions,
  MODEL_VERSION,
} from '../index';
import type { CompletedTaskFacts, PredictionLogEntry } from '../../types';

describe('v3 adapters', () => {
  it('confidenceProfileFromV1 preserves overall and derives sample strength', () => {
    const p = confidenceProfileFromV1('medium', { sampleSize: 8 });
    expect(p.overall).toBe('medium');
    expect(p.sampleStrength).toBe('high');
    expect(p.contradiction).toBe('none');
  });

  it('emptyContextSnapshot keeps unknown as null', () => {
    const c = emptyContextSnapshot('2026-09-27T10:00:00.000Z', 'Pacific/Auckland');
    expect(c.temporal.localDate).toBeNull();
    expect(c.spatial.lat).toBeNull();
    expect(c.work.jobId).toBeNull();
    expect(c.timezone).toBe('Pacific/Auckland');
  });

  it('taskFactFromCompleted maps identity and preserves typed estimate', () => {
    const facts: CompletedTaskFacts = {
      text: 'Call supplier about roof sheets',
      status: 'done',
      source: 'planned',
      estimate_mins: 45,
      actual_mins: 52,
      logged_mins: 52,
      created_at: '2026-09-20T09:00:00.000Z',
      completed_at: '2026-09-20T10:00:00.000Z',
      started_at: null,
      surface_date: '2026-09-20',
      location_text: null,
      lat: null,
      lng: null,
      job_id: 'job-1',
      info: null,
      subtaskCount: 0,
      subtaskDoneCount: 0,
      subtaskTotalMins: 0,
    };
    const t = taskFactFromCompleted(facts, {
      taskId: 'task-abc',
      userId: 'user-1',
      clusterLabel: 'supplier calls',
    });
    expect(t.taskId).toBe('task-abc');
    expect(t.typedEstimateMins).toBe(45);
    expect(t.observedMins).toBe(52);
    expect(t.jobId).toBe('job-1');
    expect(t.status).toBe('done');
  });

  it('taskFactFromHistorical does not treat zero actual as observed', () => {
    const t = taskFactFromHistorical(
      {
        text: 'Tap done without timer',
        actual_mins: 0,
        estimate_mins: 30,
      },
      { taskId: 't1', userId: 'u1' }
    );
    expect(t.observedMins).toBeNull();
    expect(t.loggedMins).toBe(0);
  });

  it('predictionFromLogEntry marks legacy model version and null taskId', () => {
    const entry: PredictionLogEntry = {
      id: 'plog-1',
      user_id: 'u1',
      task_text: 'Site measure',
      cluster_label: 'measure',
      cluster_count: 5,
      estimated_mins: 60,
      suggested_mins: 55,
      confidence: 'medium',
      actual_mins: null,
      logged_at: '2026-09-01T08:00:00.000Z',
      completed_at: null,
    };
    const p = predictionFromLogEntry(entry);
    expect(p.taskId).toBeNull();
    expect(p.modelVersion).toBe('1.x-legacy');
    expect(p.typedEstimateMins).toBe(60);
    expect(p.predicted.value).toBe(55);
    expect(p.outcomeId).toBeNull();
  });

  it('outcomeFromCompletion computes error when predicted known', () => {
    const o = outcomeFromCompletion({
      outcomeId: 'out-1',
      predictionId: 'pred-1',
      taskId: 'task-1',
      userId: 'u1',
      measuredMins: 70,
      trainMins: 70,
      trainSource: 'measured',
      predictedMins: 55,
    });
    expect(o.error?.signedMins).toBe(15);
    expect(o.error?.relative).toBeCloseTo(15 / 55);
    expect(o.kind).toBe('done');
  });

  it('pointDistribution never claims false precision for priors', () => {
    const d = pointDistribution(30, 'prior', 0);
    expect(d.expectedMins).toBe(30);
    expect(d.interval.low).toBeLessThan(d.expectedMins);
    expect(d.interval.high).toBeGreaterThan(d.expectedMins);
  });

  it('minimalEvidence marks insufficient when sampleSize is 0', () => {
    const e = minimalEvidence({
      evidenceId: 'e1',
      label: 'empty',
      sampleSize: 0,
    });
    expect(e.insufficient).toBe(true);
  });

  it('currentVersions match exported constants', () => {
    const v = currentVersions();
    expect(v.modelVersion).toBe(MODEL_VERSION);
  });
});
