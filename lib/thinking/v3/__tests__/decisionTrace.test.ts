import { describe, it, expect } from 'vitest';
import { decideTaskFit } from '../fit';
import { planCapacitySequence, type SequenceItem } from '../sequence';
import {
  decisionFromFit,
  traceFromFit,
  recordFitDecision,
  decisionFromSequence,
  recordSequenceDecision,
  decisionFromDuration,
} from '../decisionTrace';
import { MODEL_VERSION } from '../types';

describe('decisionTrace Phase 9', () => {
  it('recordFitDecision produces Decision + DecisionTrace with linked ids', () => {
    const fit = decideTaskFit({
      capacityMins: 30,
      remainingWindowMins: 120,
      sameDayRate: 0.7,
      protectFromCarry: false,
      dueToday: false,
      hasIntendedTime: false,
      isActive: false,
      behaviour: null,
      clusterBehaviour: null,
      duration: null,
    });
    const { decision, trace } = recordFitDecision(fit, {
      taskId: 'task_1',
      typedEstimateMins: 30,
      evidenceIds: ['ev_1'],
    });
    expect(decision.kind).toBe('fit');
    expect(decision.value).toBe(fit.fit);
    expect(decision.modelVersion).toBe(MODEL_VERSION);
    expect(decision.evidenceIds).toEqual(['ev_1']);
    expect(decision.reasons.length).toBeGreaterThan(0);
    expect(trace.decisionId).toBe(decision.decisionId);
    expect(trace.inputs.taskId).toBe('task_1');
    expect(trace.steps.some((s) => s.stage === 'outcome')).toBe(true);
  });

  it('protect / active fit yields strong authority', () => {
    const fit = decideTaskFit({
      capacityMins: 20,
      remainingWindowMins: 60,
      sameDayRate: null,
      protectFromCarry: true,
      dueToday: false,
      hasIntendedTime: false,
      isActive: true,
      behaviour: null,
      clusterBehaviour: null,
      duration: null,
    });
    const decision = decisionFromFit(fit);
    expect(decision.value).toBe('protect');
    expect(decision.authority).toBe('strong');
  });

  it('recordSequenceDecision links plan to DecisionTrace', () => {
    const items: SequenceItem[] = [
      {
        id: 'a',
        capacityMins: 40,
        urgency: 'anchor',
        protectFromCarry: true,
        fit: 'protect',
        orderIndex: 0,
      },
      {
        id: 'b',
        capacityMins: 90,
        urgency: 'flexible',
        protectFromCarry: false,
        fit: 'carry_safe',
        orderIndex: 1,
      },
    ];
    const plan = planCapacitySequence({
      items,
      remainingWindowMins: 50,
    });
    const { decision, trace } = recordSequenceDecision(plan);
    expect(decision.kind).toBe('sequence');
    expect(decision.modelVersion).toBe(MODEL_VERSION);
    expect(trace.decisionId).toBe(decision.decisionId);
    expect(trace.steps.some((s) => s.stage === 'input')).toBe(true);
  });

  it('decisionFromDuration records interval spread', () => {
    const { decision, trace } = decisionFromDuration({
      expectedMins: 45,
      interval: { low: 30, high: 70 },
      confidence: 'medium',
      reasons: ['cluster median'],
      taskId: 't2',
    });
    expect(decision.kind).toBe('effective_duration');
    expect(decision.value).toBe(45);
    expect(decision.interval?.low).toBe(30);
    expect(decision.uncertainty.spreadMins).toBe(40);
    expect(trace.inputs.taskId).toBe('t2');
  });

  it('decisionFromFit is pure given fixed decisionId and createdAt', () => {
    const fit = decideTaskFit({
      capacityMins: 10,
      remainingWindowMins: 100,
      sameDayRate: 0.8,
      protectFromCarry: false,
      dueToday: false,
      hasIntendedTime: false,
      isActive: false,
      behaviour: null,
      clusterBehaviour: null,
      duration: null,
    });
    const a = decisionFromFit(fit, {
      decisionId: 'dec_fixed',
      createdAt: '2026-09-28T00:00:00.000Z',
    });
    const b = decisionFromFit(fit, {
      decisionId: 'dec_fixed',
      createdAt: '2026-09-28T00:00:00.000Z',
    });
    expect(a).toEqual(b);
  });
});
