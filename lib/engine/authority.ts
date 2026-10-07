/**
 * Authority boundary — when Dokkit may act vs only suggest/ask.
 * Maps commitment class + confidence → autonomy decision.
 *
 * Capacity / fit analysis answers "does this fit comfortably?" — never
 * "is the user allowed to choose this time?". Explicit date/time on a
 * structured request is a user commitment: Dock must remain allowed.
 */

import type {
  AuthorityDecision,
  CommitmentClass,
  Confidence,
  EngineRequest,
} from './types';

/** Explicit clock or day the user stated (not inferred capacity advice). */
export function hasExplicitSchedule(req: EngineRequest): boolean {
  return !!(req.dateHint || req.timeHint);
}

export function classifyCommitment(req: EngineRequest): CommitmentClass {
  if (req.commitment === 'hard') return 'HARD_COMMITMENT';
  if (req.commitment === 'soft' || req.urgency === 'high') return 'SOFT_COMMITMENT';
  if (req.dateHint && req.objectText) return 'PLANNED_WORK';
  if (req.action === 'remind' || req.action === 'pickup' || req.action === 'create_task') {
    return 'NEW_REQUEST';
  }
  return 'SUGGESTED_WORK';
}

function isExecutableCapture(req: EngineRequest): boolean {
  return (
    !!req.objectText &&
    (req.action === 'create_task' ||
      req.action === 'pickup' ||
      req.action === 'remind')
  );
}

/**
 * Safe default: new requests may create a task (act) when structured enough,
 * but never rearrange hard commitments. Suggestions preferred when thin.
 *
 * Explicit user timing (dateHint / timeHint) on an executable capture is
 * dockable: capacity warnings stay advisory via plan suggest steps.
 */
export function decideAuthority(
  req: EngineRequest,
  opts?: { userAutonomyDefault?: AuthorityDecision['autonomy'] }
): AuthorityDecision {
  const commitmentClass = classifyCommitment(req);
  const conf: Confidence = req.confidence;
  const userDefault = opts?.userAutonomyDefault ?? 'suggest';

  // A hard commitment is the strongest user instruction, not a request for
  // confirmation. If the request is an executable capture, Dokkit must act.
  // Capacity, fit, and opportunity reasoning may advise around it, but never
  // revoke the user's chosen commitment.
  if (commitmentClass === 'HARD_COMMITMENT') {
    if (isExecutableCapture(req) && conf !== 'low') {
      return {
        commitmentClass,
        autonomy: 'act',
        mayAct: true,
        maySuggest: true,
        reason: 'explicit_hard_commitment',
      };
    }

    return {
      commitmentClass,
      autonomy: 'ask',
      mayAct: false,
      maySuggest: true,
      reason: 'hard_commitment_not_executable',
    };
  }

  // Explicit schedule + meaningful object: user already decided when.
  // Capacity may still warn; it must not revoke mayAct.
  if (isExecutableCapture(req) && hasExplicitSchedule(req)) {
    return {
      commitmentClass:
        commitmentClass === 'SOFT_COMMITMENT'
          ? 'SOFT_COMMITMENT'
          : req.dateHint && req.objectText
            ? 'PLANNED_WORK'
            : 'NEW_REQUEST',
      autonomy: 'act',
      mayAct: true,
      maySuggest: true,
      reason: 'explicit_schedule_commitment',
    };
  }

  if (commitmentClass === 'NEW_REQUEST') {
    if (conf === 'high' && req.objectText) {
      return {
        commitmentClass,
        autonomy: userDefault === 'act' ? 'act' : 'suggest',
        mayAct: true,
        maySuggest: true,
        reason: 'new_request_structured',
      };
    }
    if (conf === 'medium' && req.objectText) {
      return {
        commitmentClass,
        autonomy: 'suggest',
        mayAct: true,
        maySuggest: true,
        reason: 'new_request_partial',
      };
    }
    return {
      commitmentClass,
      autonomy: 'ask',
      mayAct: false,
      maySuggest: true,
      reason: 'new_request_thin',
    };
  }

  if (commitmentClass === 'PLANNED_WORK') {
    // Date + object without the early explicit-schedule path (e.g. low conf).
    if (conf !== 'low' && req.objectText) {
      return {
        commitmentClass,
        autonomy: 'act',
        mayAct: true,
        maySuggest: true,
        reason: 'planned_work_structured',
      };
    }
    return {
      commitmentClass,
      autonomy: 'ask',
      mayAct: false,
      maySuggest: true,
      reason: 'planned_work_thin',
    };
  }

  if (commitmentClass === 'SOFT_COMMITMENT') {
    return {
      commitmentClass,
      autonomy: 'ask',
      mayAct: false,
      maySuggest: true,
      reason: 'soft_commitment_confirm',
    };
  }

  return {
    commitmentClass,
    autonomy: 'suggest',
    mayAct: false,
    maySuggest: true,
    reason: 'default_suggest',
  };
}
