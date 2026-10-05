/**
 * Authority boundary — when Dokkit may act vs only suggest/ask.
 * Maps commitment class + confidence → autonomy decision.
 */

import type {
  AuthorityDecision,
  CommitmentClass,
  Confidence,
  EngineRequest,
} from './types';

export function classifyCommitment(req: EngineRequest): CommitmentClass {
  if (req.commitment === 'hard') return 'HARD_COMMITMENT';
  if (req.commitment === 'soft' || req.urgency === 'high') return 'SOFT_COMMITMENT';
  if (req.dateHint && req.objectText) return 'PLANNED_WORK';
  if (req.action === 'remind' || req.action === 'pickup' || req.action === 'create_task') {
    return 'NEW_REQUEST';
  }
  return 'SUGGESTED_WORK';
}

/**
 * Safe default: new requests may create a task (act) when structured enough,
 * but never rearrange hard commitments. Suggestions preferred when thin.
 */
export function decideAuthority(
  req: EngineRequest,
  opts?: { userAutonomyDefault?: AuthorityDecision['autonomy'] }
): AuthorityDecision {
  const commitmentClass = classifyCommitment(req);
  const conf: Confidence = req.confidence;
  const userDefault = opts?.userAutonomyDefault ?? 'suggest';

  if (commitmentClass === 'HARD_COMMITMENT') {
    return {
      commitmentClass,
      autonomy: 'ask',
      mayAct: false,
      maySuggest: true,
      reason: 'hard_commitment_requires_user',
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
