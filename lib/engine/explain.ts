/**
 * Deterministic explanation from structured facts — never LLM prose invention.
 */

import type { AuthorityDecision, EngineRequest, PlanProposal } from './types';

export function explainDecision(input: {
  request: EngineRequest;
  plan: PlanProposal;
  authority: AuthorityDecision;
  facts: string[];
}): string {
  const parts: string[] = [];
  const { request: req, plan, authority, facts } = input;

  if (req.objectText && req.locationText) {
    parts.push(`You asked to handle ${req.objectText} from ${req.locationText}.`);
  } else if (req.objectText) {
    parts.push(`You asked about ${req.objectText}.`);
  } else if (req.rawUtterances[0]) {
    parts.push(`Captured: “${req.rawUtterances[0]}”.`);
  }

  for (const f of facts) {
    if (authority.commitmentClass === 'HARD_COMMITMENT' && /capacity|minutes|tight|tomorrow morning/i.test(f)) {
      continue;
    }
    if (/job:/i.test(f)) parts.push(f);
    else if (/meeting/i.test(f)) parts.push(f);
    else if (/route/i.test(f)) parts.push(f);
    else if (/capacity|minutes/i.test(f)) parts.push(f);
    else if (/today|tomorrow|date/i.test(f)) parts.push(f);
  }

  if (
    plan.summary &&
    !(authority.commitmentClass === 'HARD_COMMITMENT' &&
      /today looks tight|consider tomorrow morning/i.test(plan.summary))
  ) {
    parts.push(plan.summary);
  }

  if (authority.mayAct && authority.autonomy === 'act') {
    parts.push('Acting within your usual autonomy for new requests.');
  } else if (authority.mayAct) {
    parts.push('Creating the task; placement is a suggestion you can change.');
  } else if (authority.maySuggest) {
    parts.push('Suggestion only — nothing was rearranged automatically.');
  }

  // Dedup while preserving order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(p);
    }
  }
  return unique.join(' ').trim() || 'No explanation facts available.';
}
