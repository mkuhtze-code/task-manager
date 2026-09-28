// lib/thinking/v3/decisionTrace.ts
//
// Phase 9 — structured Decision + DecisionTrace from fit / sequence.
//
// Every capacity-relevant call can leave a replayable audit trail:
// decisionId, evidence refs, step log, model versions.
// Pure. Optional — callers opt in; fit/sequence themselves stay free of IDs.

import type {
  Decision,
  DecisionTrace,
  DecisionKind,
  FitState,
  Confidence,
  ConfidenceProfile,
  Authority,
} from './types';
import { MODEL_VERSION, ALGORITHM_VERSION } from './types';
import { makeDecisionId } from './events';
import type { FitDecision } from './fit';
import type { SequencePlan } from './sequence';

function confidenceProfile(overall: Confidence): ConfidenceProfile {
  return {
    overall,
    sampleStrength: overall,
    effectStrength: overall,
    consistencyStrength: overall,
    recencyWeight: null,
    specificity: null,
    contradiction: 'none',
    staleness: 'current',
  };
}

function riskFromConfidence(c: Confidence): Decision['uncertainty']['risk'] {
  if (c === 'high') return 'low';
  if (c === 'medium') return 'medium';
  return 'high';
}

function authorityFromFit(fit: FitState, confidence: Confidence): Authority {
  if (fit === 'protect' || fit === 'blocked') return 'strong';
  if (confidence === 'high' && (fit === 'strong' || fit === 'poor')) return 'strong';
  if (confidence === 'low' || fit === 'unknown' || fit === 'uncertain') return 'observe';
  return 'suggest';
}

export type TraceFitOpts = {
  taskId?: string | null;
  typedEstimateMins?: number | null;
  contextAt?: string | null;
  evidenceIds?: string[];
  decisionId?: string;
  createdAt?: string;
  predictionId?: string | null;
};

/**
 * Build a canonical Decision from a FitDecision.
 */
export function decisionFromFit(
  fit: FitDecision,
  opts: TraceFitOpts = {}
): Decision {
  const decisionId = opts.decisionId ?? makeDecisionId();
  const createdAt = opts.createdAt ?? new Date().toISOString();
  return {
    decisionId,
    kind: 'fit',
    value: fit.fit,
    interval: null,
    confidence: confidenceProfile(fit.confidence),
    authority: authorityFromFit(fit.fit, fit.confidence),
    uncertainty: {
      risk: riskFromConfidence(fit.confidence),
      spreadMins: null,
    },
    evidenceIds: opts.evidenceIds ?? [],
    predictionId: opts.predictionId ?? null,
    modelVersion: MODEL_VERSION,
    createdAt,
    reasons: fit.reasons,
  };
}

/**
 * Build a DecisionTrace for a fit decision (step log for replay / debug).
 */
export function traceFromFit(
  fit: FitDecision,
  decision: Decision,
  opts: TraceFitOpts = {}
): DecisionTrace {
  const steps: DecisionTrace['steps'] = [
    { stage: 'input', detail: `capacityMins=${fit.effectiveCapacityMins}` },
  ];
  if (fit.durationLevel) {
    steps.push({
      stage: 'duration',
      detail: `level=${fit.durationLevel}`,
    });
  }
  for (const r of fit.reasons) {
    steps.push({ stage: 'reason', detail: r });
  }
  steps.push({
    stage: 'outcome',
    detail: `fit=${fit.fit} protectFromCarry=${fit.protectFromCarry}`,
  });

  return {
    decisionId: decision.decisionId,
    predictionId: decision.predictionId,
    modelVersion: MODEL_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    evidenceIds: decision.evidenceIds,
    steps,
    inputs: {
      taskId: opts.taskId ?? null,
      typedEstimateMins: opts.typedEstimateMins ?? null,
      contextAt: opts.contextAt ?? null,
    },
    createdAt: decision.createdAt,
  };
}

/**
 * Convenience: Decision + DecisionTrace for a fit result.
 */
export function recordFitDecision(
  fit: FitDecision,
  opts: TraceFitOpts = {}
): { decision: Decision; trace: DecisionTrace } {
  const decision = decisionFromFit(fit, opts);
  const trace = traceFromFit(fit, decision, opts);
  return { decision, trace };
}

export type TraceSequenceOpts = {
  contextAt?: string | null;
  evidenceIds?: string[];
  decisionId?: string;
  createdAt?: string;
  predictionId?: string | null;
};

/**
 * Build a canonical Decision from a SequencePlan (capacity sequencing).
 */
export function decisionFromSequence(
  plan: SequencePlan,
  opts: TraceSequenceOpts = {}
): Decision {
  const decisionId = opts.decisionId ?? makeDecisionId();
  const createdAt = opts.createdAt ?? new Date().toISOString();
  const over =
    plan.totalLoadMins > plan.remainingWindowMins
      ? 'over_capacity'
      : 'within_capacity';
  return {
    decisionId,
    kind: 'sequence',
    value: over,
    interval: null,
    confidence: confidenceProfile(
      plan.carryIds.length > 0 || plan.fitsIds.length > 0 ? 'medium' : 'low'
    ),
    authority: 'suggest',
    uncertainty: {
      risk:
        plan.totalLoadMins > plan.remainingWindowMins * 1.2 ? 'high' : 'medium',
      spreadMins: null,
    },
    evidenceIds: opts.evidenceIds ?? [],
    predictionId: opts.predictionId ?? null,
    modelVersion: MODEL_VERSION,
    createdAt,
    reasons: plan.reasons,
  };
}

/**
 * DecisionTrace for a sequence plan.
 */
export function traceFromSequence(
  plan: SequencePlan,
  decision: Decision,
  opts: TraceSequenceOpts = {}
): DecisionTrace {
  const steps: DecisionTrace['steps'] = [
    {
      stage: 'input',
      detail: `window=${plan.remainingWindowMins} load=${plan.totalLoadMins}`,
    },
    {
      stage: 'order',
      detail: `ordered=${plan.orderedIds.length} fits=${plan.fitsIds.length}`,
    },
  ];
  if (plan.carryIds.length > 0) {
    steps.push({
      stage: 'carry',
      detail: `carryIds=${plan.carryIds.join(',')}`,
    });
  }
  for (const r of plan.reasons) {
    steps.push({ stage: 'reason', detail: r });
  }
  steps.push({
    stage: 'outcome',
    detail: `value=${String(decision.value)}`,
  });

  return {
    decisionId: decision.decisionId,
    predictionId: decision.predictionId,
    modelVersion: MODEL_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    evidenceIds: decision.evidenceIds,
    steps,
    inputs: {
      taskId: null,
      typedEstimateMins: null,
      contextAt: opts.contextAt ?? null,
    },
    createdAt: decision.createdAt,
  };
}

/**
 * Convenience: Decision + DecisionTrace for a sequence plan.
 */
export function recordSequenceDecision(
  plan: SequencePlan,
  opts: TraceSequenceOpts = {}
): { decision: Decision; trace: DecisionTrace } {
  const decision = decisionFromSequence(plan, opts);
  const trace = traceFromSequence(plan, decision, opts);
  return { decision, trace };
}

/**
 * Minimal Decision for effective duration (suggest path).
 */
export function decisionFromDuration(params: {
  expectedMins: number;
  interval: { low: number; high: number } | null;
  confidence: Confidence;
  reasons: string[];
  authority?: Authority;
  evidenceIds?: string[];
  predictionId?: string | null;
  taskId?: string | null;
  typedEstimateMins?: number | null;
  createdAt?: string;
}): { decision: Decision; trace: DecisionTrace } {
  const decisionId = makeDecisionId();
  const createdAt = params.createdAt ?? new Date().toISOString();
  const decision: Decision = {
    decisionId,
    kind: 'effective_duration',
    value: params.expectedMins,
    interval: params.interval,
    confidence: confidenceProfile(params.confidence),
    authority: params.authority ?? 'suggest',
    uncertainty: {
      risk: riskFromConfidence(params.confidence),
      spreadMins:
        params.interval != null
          ? Math.max(0, params.interval.high - params.interval.low)
          : null,
    },
    evidenceIds: params.evidenceIds ?? [],
    predictionId: params.predictionId ?? null,
    modelVersion: MODEL_VERSION,
    createdAt,
    reasons: params.reasons,
  };
  const steps: DecisionTrace['steps'] = [
    { stage: 'input', detail: `expectedMins=${params.expectedMins}` },
  ];
  if (params.interval) {
    steps.push({
      stage: 'interval',
      detail: `low=${params.interval.low} high=${params.interval.high}`,
    });
  }
  for (const r of params.reasons) {
    steps.push({ stage: 'reason', detail: r });
  }
  const trace: DecisionTrace = {
    decisionId,
    predictionId: decision.predictionId,
    modelVersion: MODEL_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    evidenceIds: decision.evidenceIds,
    steps,
    inputs: {
      taskId: params.taskId ?? null,
      typedEstimateMins: params.typedEstimateMins ?? null,
      contextAt: null,
    },
    createdAt,
  };
  return { decision, trace };
}
