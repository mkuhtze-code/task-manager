import { describe, it, expect } from 'vitest';
import { computeEstimateCalibration, observeEstimateCalibration } from '../calibration';
import type { CompletedTaskFacts } from '../../types';

function makeTask(estimate: number | null, actual: number | null): CompletedTaskFacts {
  return {
    text: 'task',
    status: 'done',
    source: 'planned',
    estimate_mins: estimate ?? 0,
    actual_mins: actual,
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
  };
}

function withEstimate(est: number, actual: number): CompletedTaskFacts {
  return makeTask(est, actual);
}

describe('calibration - returns null on insufficient data', () => {
  it('returns null for fewer than 3 samples', () => {
    const tasks = [withEstimate(30, 30), withEstimate(30, 40)];
    expect(computeEstimateCalibration(tasks)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(computeEstimateCalibration([])).toBeNull();
  });

  it('excludes tasks without both estimate and actual', () => {
    const tasks = [
      withEstimate(30, 30),
      withEstimate(30, 40),
      withEstimate(45, 60),
      makeTask(0, 0), // missing estimate
      withEstimate(60, null as unknown as number), // missing actual
    ];
    const cal = computeEstimateCalibration(tasks);
    expect(cal).not.toBeNull();
    expect(cal!.sampleSize).toBe(3);
  });
});

describe('calibration - accurate estimates', () => {
  it('detects balanced near-1.0 ratios', () => {
    const tasks = [
      withEstimate(30, 30),
      withEstimate(60, 62),
      withEstimate(45, 44),
    ];
    const cal = computeEstimateCalibration(tasks)!;
    expect(cal.medianRatio).toBeCloseTo(1.0, 1);
    expect(cal.directionBias).toBe('balanced');
  });
});

describe('calibration - systematic estimation bias', () => {
  it('detects systematic over-estimation', () => {
    const tasks = [
      withEstimate(60, 30),
      withEstimate(60, 25),
      withEstimate(60, 35),
    ];
    const cal = computeEstimateCalibration(tasks)!;
    expect(cal.medianRatio).toBeCloseTo(0.5, 1);
    expect(cal.directionBias).toBe('over');
  });

  it('detects systematic under-estimation', () => {
    const tasks = [
      withEstimate(30, 60),
      withEstimate(30, 55),
      withEstimate(30, 65),
    ];
    const cal = computeEstimateCalibration(tasks)!;
    expect(cal.medianRatio).toBeCloseTo(2.0, 1);
    expect(cal.directionBias).toBe('under');
  });

  it('reports balanced when bias is not systematic', () => {
    const tasks = [
      withEstimate(30, 60),
      withEstimate(60, 30),
      withEstimate(45, 45),
    ];
    const cal = computeEstimateCalibration(tasks)!;
    expect(cal.directionBias).toBe('balanced');
  });
});

describe('calibration - variance and outliers', () => {
  it('produces low consistency with high variance', () => {
    const tasks = [
      withEstimate(30, 10),
      withEstimate(30, 90),
      withEstimate(30, 15),
    ];
    const cal = computeEstimateCalibration(tasks)!;
    expect(cal.consistency).toBeLessThan(0.5);
  });

  it('counts outliers beyond 2x IQR', () => {
    // Large spread; a far outlier should be flagged when enough points
    const tasks = [
      withEstimate(30, 30),
      withEstimate(30, 31),
      withEstimate(30, 29),
      withEstimate(30, 32),
      withEstimate(30, 28),
      withEstimate(30, 31),
      withEstimate(30, 30),
      withEstimate(30, 120),
    ];
    const cal = computeEstimateCalibration(tasks)!;
    expect(cal.outlierCount).toBeGreaterThan(0);
  });
});

describe('calibration - observation emission', () => {
  it('emits null when insufficient data', () => {
    expect(observeEstimateCalibration([])).toBeNull();
    expect(observeEstimateCalibration([withEstimate(30, 30)])).toBeNull();
  });

  it('emits a structured observation with sufficient data', () => {
    const tasks = [
      withEstimate(60, 30),
      withEstimate(60, 25),
      withEstimate(60, 35),
      withEstimate(60, 32),
    ];
    const obs = observeEstimateCalibration(tasks);
    expect(obs).not.toBeNull();
    expect(obs!.type).toBe('estimate_calibration');
    expect(obs!.evidence.sampleSize).toBe(4);
    expect(obs!.confidence).toBeDefined();
  });
});
