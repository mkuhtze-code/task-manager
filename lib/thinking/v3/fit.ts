// lib/thinking/v3/fit.ts
//
// Phase 7 — task fit for this person, in this moment.
//
// Combines hierarchical duration belief, behaviour (carry/bias/variance),
// and calendar pressure into a FitState. Pure. Deterministic.

import type { FitState, Confidence, ConfidenceProfile } from './types';
import type { UserBehaviourModel, ClusterBehaviourSlice } from './behaviour';
import type { HierarchicalDuration } from './model';

export type FitCalendarContext = {
  remainingWindowMins: number | null;
  /** Minutes until next fixed commitment (meeting / intended block). */
  minsToNextCommitment: number | null;
  meetingDensity: number | null;
};

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
  /** Optional richer calendar. */
  calendar?: FitCalendarContext | null;
};

export type FitDecision = {
  fit: FitState;
  confidence: Confidence;
  protectFromCarry: boolean;
  reasons: string[];
  /** Suggested remaining cost after bias (mirrors capacity when available). */
  effectiveCapacityMins: number;
  /** Duration level used, if any. */
  durationLevel?: HierarchicalDuration['level'] | null;
};

function profileOverall(c: ConfidenceProfile | Confidence | undefined): Confidence {
  if (!c) return 'low';
  if (typeof c === 'string') return c;
  return c.overall;
}

function weaker(a: Confidence, b: Confidence): Confidence {
  const rank = { low: 0, medium: 1, high: 2 };
  return rank[a] <= rank[b] ? a : b;
}

/**
 * Decide whether this task fits the remaining day for this person.
 */
export function decideTaskFit(input: FitInput): FitDecision {
  const reasons: string[] = [];
  const capacity = Math.max(0, input.capacityMins);
  const cost = capacity;
  const durationLevel = input.duration?.level ?? null;

  const interval = input.duration?.distribution.interval ?? null;
  const spread =
    interval != null ? Math.max(0, interval.high - interval.low) : null;
  const highDurationUncertainty =
    (spread != null && cost > 0 && spread / Math.max(cost, 1) >= 0.6) ||
    (input.duration != null &&
      input.duration.authority === 'observe' &&
      input.duration.distribution.sampleSize < 2);

  if (input.isActive) {
    return {
      fit: 'protect',
      confidence: 'high',
      protectFromCarry: true,
      reasons: ['task is active'],
      effectiveCapacityMins: cost,
      durationLevel,
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
      durationLevel,
    };
  }

  const window =
    input.calendar?.remainingWindowMins ?? input.remainingWindowMins;
  const minsToNext = input.calendar?.minsToNextCommitment ?? null;

  if (minsToNext != null && minsToNext >= 0 && cost > minsToNext * 1.05) {
    reasons.push('would overrun next commitment');
    const carryOk =
      !input.protectFromCarry &&
      ((input.sameDayRate != null && input.sameDayRate < 0.45) ||
        (input.clusterBehaviour?.carryRate != null &&
          input.clusterBehaviour.carryRate >= 0.5));
    if (carryOk) {
      return {
        fit: 'carry_safe',
        confidence: 'medium',
        protectFromCarry: false,
        reasons: [...reasons, 'often moves forward'],
        effectiveCapacityMins: cost,
        durationLevel,
      };
    }
    return {
      fit: 'blocked',
      confidence: 'medium',
      protectFromCarry: true,
      reasons,
      effectiveCapacityMins: cost,
      durationLevel,
    };
  }

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
        durationLevel,
      };
    }

    reasons.push('exceeds remaining window');
    return {
      fit: 'poor',
      confidence: 'medium',
      protectFromCarry: input.protectFromCarry,
      reasons,
      effectiveCapacityMins: cost,
      durationLevel,
    };
  }

  if (input.clusterBehaviour?.highVariance || highDurationUncertainty) {
    if (input.clusterBehaviour?.highVariance) {
      reasons.push('high duration variance for similar work');
    } else {
      reasons.push('duration evidence is weak or wide');
    }
    if (window != null && cost > window * 0.65) {
      return {
        fit: 'uncertain',
        confidence: 'low',
        protectFromCarry: true,
        reasons,
        effectiveCapacityMins: cost,
        durationLevel,
      };
    }
  }

  const durConf = profileOverall(input.duration?.confidence);

  if (window != null && cost <= window * 0.5) {
    reasons.push('comfortable within remaining window');
    if (input.duration && input.duration.level === 'cluster') {
      reasons.push(
        `duration from cluster (${input.duration.distribution.sampleSize} samples)`
      );
    }
    return {
      fit: 'strong',
      confidence: weaker(
        durConf || 'medium',
        highDurationUncertainty ? 'low' : 'high'
      ),
      protectFromCarry: input.protectFromCarry,
      reasons,
      effectiveCapacityMins: cost,
      durationLevel,
    };
  }

  if (window != null && cost <= window) {
    reasons.push('fits remaining window');
    return {
      fit: 'possible',
      confidence: weaker(
        durConf || 'medium',
        highDurationUncertainty ? 'low' : 'medium'
      ),
      protectFromCarry: input.protectFromCarry,
      reasons,
      effectiveCapacityMins: cost,
      durationLevel,
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
      durationLevel,
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
      durationLevel,
    };
  }

  return {
    fit: 'unknown',
    confidence: 'low',
    protectFromCarry: input.protectFromCarry,
    reasons: reasons.length ? reasons : ['insufficient evidence'],
    effectiveCapacityMins: cost,
    durationLevel,
  };
}
