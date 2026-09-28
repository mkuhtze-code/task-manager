// lib/thinking/v3/fit.ts
//
// Phase 7 foundation — task fit for this person, in this moment.
//
// Combines duration belief, behaviour (carry/bias/variance), and
// calendar pressure into a FitState. Pure. Deterministic.

import type { FitState, Confidence, ConfidenceProfile } from './types';
import type { UserBehaviourModel, ClusterBehaviourSlice } from './behaviour';
import type { HierarchicalDuration } from './model';

export type FitInput = {
  /** Remaining capacity needed (mins). */
  capacityMins: number;
  /** Remaining window in the day (mins). */
  remainingWindowMins: number | null;
  sameDayRate: number | null;
  protectFromCarry: boolean;
  dueToday: boolean;
  hasIntendedTime: boolean;
  isActive: boolean;
  behaviour: UserBehaviourModel | null;
  clusterBehaviour: ClusterBehaviourSlice | null;
  duration: HierarchicalDuration | null;
  /** Soft bias scale already applied to capacity (1 = neutral). */
  capacityBiasScale?: number;
};

export type FitDecision = {
  fit: FitState;
  confidence: Confidence;
  protectFromCarry: boolean;
  reasons: string[];
  /** Suggested remaining cost after bias (mirrors capacity when available). */
  effectiveCapacityMins: number;
};

function profileOverall(c: ConfidenceProfile | Confidence | undefined): Confidence {
  if (!c) return 'low';
  if (typeof c === 'string') return c;
  return c.overall;
}

/**
 * Decide whether this task fits the remaining day for this person.
 */
export function decideTaskFit(input: FitInput): FitDecision {
  const reasons: string[] = [];
  const capacity = Math.max(0, input.capacityMins);
  const cost = capacity;

  if (input.isActive) {
    return {
      fit: 'protect',
      confidence: 'high',
      protectFromCarry: true,
      reasons: ['task is active'],
      effectiveCapacityMins: cost,
    };
  }

  if (input.hasIntendedTime || input.dueToday) {
    reasons.push(input.hasIntendedTime ? 'has intended time' : 'due today');
    return {
      fit: 'protect',
      confidence: 'high',
      protectFromCarry: true,
      reasons,
      effectiveCapacityMins: cost,
    };
  }

  const window = input.remainingWindowMins;
  if (window != null && window >= 0 && cost > window * 1.05) {
    const carryOk =
      !input.protectFromCarry &&
      ((input.sameDayRate != null && input.sameDayRate < 0.45) ||
        (input.clusterBehaviour?.carryRate != null &&
          input.clusterBehaviour.carryRate >= 0.5));

    if (carryOk) {
      reasons.push('exceeds remaining window; often moves forward');
      return {
        fit: 'carry_safe',
        confidence: input.sameDayRate != null ? 'medium' : 'low',
        protectFromCarry: false,
        reasons,
        effectiveCapacityMins: cost,
      };
    }

    reasons.push('exceeds remaining window');
    return {
      fit: 'poor',
      confidence: 'medium',
      protectFromCarry: input.protectFromCarry,
      reasons,
      effectiveCapacityMins: cost,
    };
  }

  if (input.clusterBehaviour?.highVariance) {
    reasons.push('high duration variance for similar work');
    if (window != null && cost > window * 0.7) {
      return {
        fit: 'uncertain',
        confidence: 'low',
        protectFromCarry: true,
        reasons,
        effectiveCapacityMins: cost,
      };
    }
  }

  if (window != null && cost <= window * 0.5) {
    reasons.push('comfortable within remaining window');
    return {
      fit: 'strong',
      confidence: profileOverall(input.duration?.confidence) || 'medium',
      protectFromCarry: input.protectFromCarry,
      reasons,
      effectiveCapacityMins: cost,
    };
  }

  if (window != null && cost <= window) {
    reasons.push('fits remaining window');
    return {
      fit: 'possible',
      confidence: 'medium',
      protectFromCarry: input.protectFromCarry,
      reasons,
      effectiveCapacityMins: cost,
    };
  }

  if (input.sameDayRate != null && input.sameDayRate >= 0.55) {
    reasons.push('usually finished same day');
    return {
      fit: 'strong',
      confidence: 'medium',
      protectFromCarry: true,
      reasons,
      effectiveCapacityMins: cost,
    };
  }

  if (input.sameDayRate != null && input.sameDayRate < 0.4) {
    reasons.push('often moves forward');
    return {
      fit: 'carry_safe',
      confidence: 'medium',
      protectFromCarry: false,
      reasons,
      effectiveCapacityMins: cost,
    };
  }

  return {
    fit: 'unknown',
    confidence: 'low',
    protectFromCarry: input.protectFromCarry,
    reasons: reasons.length ? reasons : ['insufficient evidence'],
    effectiveCapacityMins: cost,
  };
}
