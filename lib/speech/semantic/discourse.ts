/**
 * Discourse supersession — later clauses revise earlier acts.
 * Evidence retained; superseded acts blocked from create.
 */

import type { SemanticAct } from './types';
import { isDiscourseActually } from './correctionChain';

const DISCOURSE_REPLACE =
  /\b(?:actually|instead|no,?\s+(?:wait,?\s+)?(?:call|email|text|meet)|scratch\s+that|never\s+mind)\b/i;

const TEMPORAL_ONLY =
  /^(?:actually|no,?\s+wait,?\s*)?(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+week|this\s+(?:friday|monday|afternoon|morning)|end\s+of\s+the\s+week|after\s+lunch|before\s+lunch|by\s+friday|sometime\s+next\s+week|this\s+afternoon)[.!]?\s*$/i;

const TELL_CLAUSE =
  /^\s*(?:and\s+)?(?:tell|ask|remind)\s+(him|her|them|it)\b/i;

function objectKey(act: SemanticAct): string {
  const names = act.rawSpan.match(/\b[A-Z][a-z]{1,20}\b/g) ?? [];
  const skip = new Set([
    'Actually',
    'Wait',
    'Call',
    'Email',
    'Meet',
    'Send',
    'Text',
    'Message',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
    'Tomorrow',
    'Today',
  ]);
  const person = [...names].reverse().find((n) => !skip.has(n));
  if (person) return person.toLowerCase();
  const o = (act.objectText ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  return o.split(/\s+/).filter(Boolean)[0] ?? '';
}

function sameVerbFamily(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export function applyDiscourseSupersession(acts: SemanticAct[]): SemanticAct[] {
  if (acts.length < 2) return acts;

  let next = acts.map((a) => ({ ...a, evidence: [...a.evidence] }));

  for (let i = 0; i < next.length; i++) {
    const later = next[i];
    if (later.kind !== 'action' || later.polarity === 'negated' || later.blocksTaskCreation) {
      continue;
    }
    const discourse =
      isDiscourseActually(later.rawSpan) || DISCOURSE_REPLACE.test(later.rawSpan);
    if (!discourse) continue;

    for (let j = 0; j < i; j++) {
      const earlier = next[j];
      if (earlier.kind !== 'action' || earlier.blocksTaskCreation) continue;
      if (!sameVerbFamily(earlier.actionVerb, later.actionVerb) && later.actionVerb) {
        if (!isDiscourseActually(later.rawSpan) && !/\binstead\b/i.test(later.rawSpan)) {
          continue;
        }
      }
      const earlierKey = objectKey(earlier);
      const laterKey = objectKey(later);
      if (laterKey && earlierKey && laterKey !== earlierKey) {
        next[j] = {
          ...earlier,
          blocksTaskCreation: true,
          evidence: [
            ...earlier.evidence,
            {
              signal: 'superseded_by_entity_replacement',
              source: 'discourse',
              span: later.rawSpan.slice(0, 60),
            },
          ],
        };
      } else if (sameVerbFamily(earlier.actionVerb, later.actionVerb)) {
        next[j] = {
          ...earlier,
          blocksTaskCreation: true,
          evidence: [
            ...earlier.evidence,
            {
              signal: 'superseded_by_later_action',
              source: 'discourse',
              span: later.rawSpan.slice(0, 60),
            },
          ],
        };
      }
    }
  }

  for (let i = 0; i < next.length; i++) {
    const clause = next[i];
    const span = clause.rawSpan.trim();
    if (clause.kind === 'action' && clause.actionVerb) continue;
    if (!TEMPORAL_ONLY.test(span) && !(isDiscourseActually(span) && clause.temporalRaw)) {
      if (!(isDiscourseActually(span) || /^(?:no,?\s+)?(?:wait,?\s*)?/i.test(span))) {
        continue;
      }
      if (
        !clause.temporalRaw &&
        !TEMPORAL_ONLY.test(span.replace(/^(?:actually|no,?\s+wait,?\s*)/i, '').trim())
      ) {
        continue;
      }
    }

    let priorIdx = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (next[j].kind === 'action' && !next[j].blocksTaskCreation) {
        priorIdx = j;
        break;
      }
      if (next[j].kind === 'action') {
        priorIdx = j;
        break;
      }
    }
    if (priorIdx < 0) continue;

    const prior = next[priorIdx];
    const temporalRaw =
      clause.temporalRaw ??
      span
        .replace(/^(?:actually|no,?\s+wait,?\s*)/i, '')
        .replace(/[.!]+$/, '')
        .trim();

    next[priorIdx] = {
      ...prior,
      temporalRaw: temporalRaw || prior.temporalRaw,
      temporalRelation: clause.temporalRelation ?? prior.temporalRelation,
      temporalResolvedDate: clause.temporalResolvedDate ?? prior.temporalResolvedDate,
      blocksTaskCreation: prior.polarity === 'negated' ? true : false,
      evidence: [
        ...prior.evidence,
        {
          signal: 'temporal_revised',
          source: 'discourse',
          span: temporalRaw,
        },
      ],
    };

    next[i] = {
      ...clause,
      kind: clause.kind === 'unknown' ? 'correction' : clause.kind,
      blocksTaskCreation: true,
      evidence: [
        ...clause.evidence,
        { signal: 'temporal_revision_clause', source: 'discourse' },
      ],
    };
  }

  for (let i = 0; i < next.length; i++) {
    const clause = next[i];
    const m = clause.rawSpan.match(TELL_CLAUSE);
    if (!m) continue;

    let priorIdx = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (
        next[j].kind === 'action' &&
        /^(?:call|email|message|text|meet)$/i.test(next[j].actionVerb ?? '')
      ) {
        priorIdx = j;
        break;
      }
    }
    if (priorIdx < 0) continue;

    const prior = next[priorIdx];
    const tellContent = clause.rawSpan.replace(TELL_CLAUSE, '').trim();
    next[priorIdx] = {
      ...prior,
      objectText: prior.objectText
        ? `${prior.objectText}; tell: ${tellContent}`.slice(0, 120)
        : `tell: ${tellContent}`.slice(0, 120),
      evidence: [
        ...prior.evidence,
        {
          signal: 'tell_clause_attached',
          source: 'discourse',
          span: clause.rawSpan.slice(0, 60),
        },
      ],
    };
    next[i] = {
      ...clause,
      blocksTaskCreation: true,
      evidence: [
        ...clause.evidence,
        { signal: 'merged_into_prior_act', source: 'discourse' },
      ],
    };
  }

  for (let i = 0; i < next.length; i++) {
    const later = next[i];
    if (later.polarity !== 'negated' && later.kind !== 'retraction' && later.kind !== 'refusal') {
      continue;
    }
    for (let j = 0; j < i; j++) {
      const earlier = next[j];
      if (earlier.kind !== 'action' || earlier.blocksTaskCreation) continue;
      if (sameVerbFamily(earlier.actionVerb, later.actionVerb) || later.kind === 'retraction') {
        const ek = objectKey(earlier);
        const lk = objectKey(later);
        if (!lk || !ek || ek === lk || later.kind === 'retraction') {
          next[j] = {
            ...earlier,
            blocksTaskCreation: true,
            evidence: [
              ...earlier.evidence,
              {
                signal: 'cancelled_by_later_negation',
                source: 'discourse',
                span: later.rawSpan.slice(0, 60),
              },
            ],
          };
        }
      }
    }
  }


  // 5. Same person + same verb family: later open action supersedes earlier
  //    even without explicit "actually" (long-form plan revision).
  for (let i = 0; i < next.length; i++) {
    const later = next[i];
    if (later.kind !== 'action' || later.blocksTaskCreation || later.polarity === 'negated') continue;
    if (!later.actionVerb) continue;
    const laterKey = objectKey(later);
    if (!laterKey) continue;
    for (let j = 0; j < i; j++) {
      const earlier = next[j];
      if (earlier.kind !== 'action' || earlier.blocksTaskCreation) continue;
      if (!sameVerbFamily(earlier.actionVerb, later.actionVerb)) continue;
      const earlierKey = objectKey(earlier);
      if (earlierKey && earlierKey === laterKey) {
        next[j] = {
          ...earlier,
          blocksTaskCreation: true,
          evidence: [
            ...earlier.evidence,
            {
              signal: 'superseded_by_later_same_person_action',
              source: 'discourse',
              span: later.rawSpan.slice(0, 60),
            },
          ],
        };
        // Inherit earlier dependency evidence onto later if later has none
        if (!later.dependency && earlier.dependency) {
          next[i] = {
            ...next[i],
            dependency: earlier.dependency,
            evidence: [
              ...next[i].evidence,
              {
                signal: 'dependency_inherited_from_superseded',
                source: 'discourse',
                span: earlier.dependency.raw,
              },
            ],
          };
        }
      }
    }
  }

  return next;
}

export function reclassifyPastTenseObservations(acts: SemanticAct[]): SemanticAct[] {
  return acts.map((a) => {
    if (a.polarity === 'negated') return a;
    if (a.kind !== 'action' && a.kind !== 'unknown') return a;
    const span = a.rawSpan;
    const past =
      /\bi\s+(?:called|emailed|sent|spoke|met|texted|messaged|ordered|booked|finished|completed)\b/i.test(
        span
      );
    const future =
      /\b(?:need\s+to|have\s+to|got\s+to|will|i'll|gonna|going\s+to|tomorrow|friday|next)\b/i.test(
        span
      );
    if (past && !future) {
      return {
        ...a,
        kind: 'observation' as const,
        blocksTaskCreation: true,
        evidence: [
          ...a.evidence,
          { signal: 'past_tense_observation', source: 'discourse' },
        ],
      };
    }
    return a;
  });
}
