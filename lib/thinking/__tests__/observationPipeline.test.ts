// lib/thinking/__tests__/observationPipeline.test.ts

import { describe, it, expect } from 'vitest';
import { generateObservations } from '../pipeline/observationPipeline';
import { evaluateEvidenceConfidence } from '../pipeline/confidence';
import type { CompletedTaskFacts } from '../types';

const TEST_NOW = new Date('2025-01-20T00:00:00Z');

function makeFact(overrides: Partial<CompletedTaskFacts> = {}): CompletedTaskFacts {
  return {
    text: 'Site Visit',
    status: 'done',
    source: 'planned',
    estimate_mins: 30,
    actual_mins: 60,
    logged_mins: 60,
    created_at: '2025-01-10T09:00:00Z',
    completed_at: '2025-01-10T10:00:00Z',
    started_at: '2025-01-10T09:00:00Z',
    surface_date: '2025-01-10',
    location_text: null,
    lat: null,
    lng: null,
    job_id: null,
    info: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    subtaskTotalMins: 0,
    ...overrides,
  };
}

describe('Thinking Engine V2 — Observation Pipeline', () => {
  describe('Confidence Evaluator', () => {
    it('returns null for sample count below minimum threshold (3)', () => {
      const res = evaluateEvidenceConfidence({ sampleCount: 2, consistencyRatio: 0.8 });
      expect(res).toBeNull();
    });

    it('returns null for consistency ratio below threshold (0.6)', () => {
      const res = evaluateEvidenceConfidence({ sampleCount: 5, consistencyRatio: 0.5 });
      expect(res).toBeNull();
    });

    it('assigns confidence level based on sample size and consistency ratio', () => {
      const low = evaluateEvidenceConfidence({ sampleCount: 3, consistencyRatio: 0.65 });
      expect(low?.confidence).toBe('low');

      const med = evaluateEvidenceConfidence({ sampleCount: 6, consistencyRatio: 0.7 });
      expect(med?.confidence).toBe('medium');

      const high = evaluateEvidenceConfidence({ sampleCount: 10, consistencyRatio: 0.8 });
      expect(high?.confidence).toBe('high');
    });

    it('flags observation as stale if last observed date is older than 90 days', () => {
      const now = new Date('2025-05-01T00:00:00Z');
      const oldDate = '2025-01-01T00:00:00Z'; // ~120 days ago

      const res = evaluateEvidenceConfidence({
        sampleCount: 5,
        consistencyRatio: 0.8,
        lastObservedAt: oldDate,
        now,
      });

      expect(res?.status).toBe('stale');
    });
  });

  describe('Estimate Calibration Detector', () => {
    it('detects consistent underestimation when actual duration consistently exceeds estimated', () => {
      const facts: CompletedTaskFacts[] = [
        makeFact({ text: 'Site Visit', estimate_mins: 15, actual_mins: 30 }),
        makeFact({ text: 'Site Visit', estimate_mins: 15, actual_mins: 35 }),
        makeFact({ text: 'Site Visit', estimate_mins: 15, actual_mins: 40 }),
        makeFact({ text: 'Site Visit', estimate_mins: 15, actual_mins: 30 }),
      ];

      const obs = generateObservations({ facts, now: TEST_NOW });
      const estObs = obs.find((o) => o.type === 'estimate_calibration');

      expect(estObs).toBeDefined();
      expect(estObs?.title).toContain('take longer than estimated');
      expect(estObs?.evidence.sampleCount).toBe(4);
    });

    it('rejects candidate when evidence is insufficient (< 3 tasks with actual duration)', () => {
      const facts: CompletedTaskFacts[] = [
        makeFact({ text: 'Site Visit', estimate_mins: 15, actual_mins: 30 }),
        makeFact({ text: 'Site Visit', estimate_mins: 15, actual_mins: 35 }),
      ];

      const obs = generateObservations({ facts, now: TEST_NOW });
      const estObs = obs.find((o) => o.type === 'estimate_calibration');
      expect(estObs).toBeUndefined();
    });

    it('rejects candidate when evidence is contradictory (50% under, 50% over)', () => {
      const facts: CompletedTaskFacts[] = [
        makeFact({ text: 'Site Visit', estimate_mins: 30, actual_mins: 60 }), // Under
        makeFact({ text: 'Site Visit', estimate_mins: 30, actual_mins: 60 }), // Under
        makeFact({ text: 'Site Visit', estimate_mins: 60, actual_mins: 15 }), // Over
        makeFact({ text: 'Site Visit', estimate_mins: 60, actual_mins: 15 }), // Over
      ];

      const obs = generateObservations({ facts, now: TEST_NOW });
      const estObs = obs.find((o) => o.type === 'estimate_calibration');
      expect(estObs).toBeUndefined();
    });
  });

  describe('Repeated Carryover Detector', () => {
    it('detects repeated carryover when tasks consistently complete on a later day', () => {
      const facts: CompletedTaskFacts[] = [
        makeFact({
          text: 'Monthly Invoicing',
          created_at: '2025-01-01T10:00:00Z',
          completed_at: '2025-01-03T10:00:00Z',
        }),
        makeFact({
          text: 'Monthly Invoicing',
          created_at: '2025-01-05T10:00:00Z',
          completed_at: '2025-01-07T10:00:00Z',
        }),
        makeFact({
          text: 'Monthly Invoicing',
          created_at: '2025-01-10T10:00:00Z',
          completed_at: '2025-01-12T10:00:00Z',
        }),
      ];

      const obs = generateObservations({ facts, now: TEST_NOW });
      const carryObs = obs.find((o) => o.type === 'repeated_carryover');

      expect(carryObs).toBeDefined();
      expect(carryObs?.title).toContain('frequently span multiple days');
      expect(carryObs?.evidence.consistencyRatio).toBe(1.0);
    });

    it('does NOT trigger repeated carryover on isolated one-off carryover task', () => {
      const facts: CompletedTaskFacts[] = [
        makeFact({
          text: 'Monthly Invoicing',
          created_at: '2025-01-01T10:00:00Z',
          completed_at: '2025-01-03T10:00:00Z', // Carryover
        }),
        makeFact({
          text: 'Monthly Invoicing',
          created_at: '2025-01-05T10:00:00Z',
          completed_at: '2025-01-05T12:00:00Z', // Same day
        }),
        makeFact({
          text: 'Monthly Invoicing',
          created_at: '2025-01-10T10:00:00Z',
          completed_at: '2025-01-10T12:00:00Z', // Same day
        }),
        makeFact({
          text: 'Monthly Invoicing',
          created_at: '2025-01-15T10:00:00Z',
          completed_at: '2025-01-15T12:00:00Z', // Same day
        }),
      ];

      const obs = generateObservations({ facts, now: TEST_NOW });
      const carryObs = obs.find((o) => o.type === 'repeated_carryover');

      // Carryover rate is 1/4 = 0.25 < 0.60 threshold
      expect(carryObs).toBeUndefined();
    });
  });

  describe('Time-of-Day Detector', () => {
    it('identifies time-of-day preference for short admin tasks', () => {
      const facts: CompletedTaskFacts[] = [
        makeFact({ text: 'Call Client', estimate_mins: 10, actual_mins: 10, completed_at: '2025-01-10T08:00:00Z' }),
        makeFact({ text: 'Call Supplier', estimate_mins: 10, actual_mins: 10, completed_at: '2025-01-11T09:00:00Z' }),
        makeFact({ text: 'Call Bank', estimate_mins: 10, actual_mins: 10, completed_at: '2025-01-12T08:30:00Z' }),
        makeFact({ text: 'Call Doctor', estimate_mins: 10, actual_mins: 10, completed_at: '2025-01-13T10:00:00Z' }),
      ];

      const obs = generateObservations({ facts, now: TEST_NOW });
      const todObs = obs.find((o) => o.type === 'time_of_day');

      expect(todObs).toBeDefined();
      expect(todObs?.title).toContain('in the morning');
    });
  });

  describe('Deduplication & Ranking', () => {
    it('ranks observations by confidence and sample count', () => {
      const facts: CompletedTaskFacts[] = [
        // Group 1: 10 underestimated tasks -> high confidence
        ...Array.from({ length: 10 }).map(() =>
          makeFact({ text: 'Big Repair', estimate_mins: 30, actual_mins: 90 })
        ),
        // Group 2: 3 underestimated tasks -> low confidence
        ...Array.from({ length: 3 }).map(() =>
          makeFact({ text: 'Small Fix', estimate_mins: 10, actual_mins: 30 })
        ),
      ];

      const obs = generateObservations({ facts, now: TEST_NOW });
      expect(obs.length).toBeGreaterThanOrEqual(2);

      // Higher confidence should come first
      expect(obs[0].confidence).toBe('high');
      expect(obs[0].clusterLabel).toBe('Big Repair');
    });
  });
});
