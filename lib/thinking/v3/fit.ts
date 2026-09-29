// lib/thinking/v3/fit.ts
//
// Phase 7 — task fit for this person, in this moment.
//
// Combines hierarchical duration belief, behaviour (carry/bias/variance),
// and calendar pressure into a FitState. Pure. Deterministic.

import type { FitState, Confidence, ConfidenceProfile } from './types';
import type { UserBehaviourModel, ClusterBehaviourSlice } from './behaviour';
import type { HierarchicalDuration } from './model';
import type { MultiChannelBelief } from './beliefs';
import type { BeliefAuthority } from './learningRates';
import {
  type StructuralFeatures,
  coldStartCapacityHint,
  isColdStartDuration,
} from './coldStart';

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
  /** FP-2 — multi-channel belief for matched work (carry / fragility / authority). */
  multiChannel?: MultiChannelBelief | null;
  /** FP-2 — structural task features for cold-start honesty. */
  structural?: StructuralFeatures | null;
  /** Soft floor when personal duration is absent. */
  softFloorMins?: number;
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

/** UX-4 / S5 — never present strong fit without personal evidence. */
function demoteStrongIfCold(
  decision: FitDecision,
  cold: boolean
): FitDecision {
  if (!cold || decision.fit !== 'strong') return decision;
  return {
    ...decision,
    fit: 'possible',
    confidence: weaker(decision.confidence, 'low'),
    reasons: [
      ...decision.reasons,
      'using structure until personal evidence builds',
    ],
  };
}

function mayCarry(input: FitInput): boolean {
  if (input.protectFromCarry) return false;
  if (input.sameDayRate != null && input.sameDayRate < 0.45) return true;
  if (
    input.clusterBehaviour?.carryRate != null &&
    input.clusterBehaviour.carryRate >= 0.5
  ) {
    return true;
  }
  // FP-2: multi-channel carry hazard
  if (
    input.multiChannel?.carryHazard != null &&
    input.multiChannel.carryHazard >= 0.45
  ) {
    return true;
  }
  return false;
}

function beliefAuthority(input: FitInput): BeliefAuthority | null {
  return input.multiChannel?.authority ?? null;
}

/**
 * Decide whether this task fits the remaining day for this person.
 * FP-2 + UX-4/S5: cold-start structural path; never strong fit without evidence.
 */
export function decideTaskFit(input: FitInput): FitDecision {
  const reasons: string[] = [];
  let capacity = Math.max(0, input.capacityMins);
  const durationLevel = input.duration?.level ?? null;
  const cold = isColdStartDuration(input.duration);
  const auth = beliefAuthority(input);

  // Cold-start: when personal duration is weak, prefer structural capacity hint.
  if (cold && input.structural) {
    const hint = coldStartCapacityHint(input.structural, {
      softFloorMins: input.softFloorMins ?? 30,
    });
    if (capacity <= 0 || durationLevel === 'system' || durationLevel === 'onboarding') {
      capacity = hint.mins;
      reasons.push(...hint.reasons.map((r) => `cold-start: ${r}`));
    } else if (input.structural.estimateMins == null) {
      // Blend slightly toward structure when evidence is thin
      capacity = Math.round(capacity * 0.7 + hint.mins * 0.3);
      reasons.push('cold-start blend with structure');
    }
  }

  if (auth === 'unknown' || auth === 'early') {
    reasons.push(`belief authority ${auth ?? 'unknown'}`);
  }

  const cost = capacity;

  // Optional-chain distribution: incomplete hierarchical rows must not throw in render.
  const dist = input.duration?.distribution ?? null;
  const interval = dist?.interval ?? null;
  const spread =
    interval != null ? Math.max(0, interval.high - interval.low) : null;
  const sampleSize = dist?.sampleSize ?? 0;
  const highDurationUncertainty =
    cold ||
    (spread != null && cost > 0 && spread / Math.max(cost, 1) >= 0.6) ||
    (input.duration != null &&
      input.duration.authority === 'observe' &&
      sampleSize < 2) ||
    (auth === 'unknown' || auth === 'early');

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
    const carryOk = mayCarry(input);
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
    const carryOk = mayCarry(input);

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
        `duration from cluster (${input.duration.distribution?.sampleSize ?? 0} samples)`
      );
    }
    return demoteStrongIfCold({
      fit: 'strong',
      confidence: weaker(
        durConf || 'medium',
        highDurationUncertainty ? 'low' : 'high'
      ),
      protectFromCarry: input.protectFromCarry,
      reasons,
      effectiveCapacityMins: cost,
      durationLevel,
    }, cold);
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
    return demoteStrongIfCold({
      fit: 'strong',
      confidence: 'medium',
      protectFromCarry: true,
      reasons,
      effectiveCapacityMins: cost,
      durationLevel,
    }, cold);
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
