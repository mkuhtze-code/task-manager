/**
 * Feasibility ANSWER — orchestrates V3 decideTaskFit + DecisionTrace.
 */

import type { EngineCycleResult } from './types';
import type { InteractionInput, InteractionAnswer } from './interactionTypes';
import { decideTaskFit } from '@/lib/thinking/v3/fit';
import { decisionFromFit, traceFromFit } from '@/lib/thinking/v3/decisionTrace';
import type { Decision, DecisionTrace } from '@/lib/thinking/v3/types';

// ANSWER and ACT intentionally share the same V3 fit evaluator below; keep both paths aligned.

/**
 * Resolve whether a feasibility check is about a visit/movement or ordinary
 * work. ACT and ANSWER must use the same rule so the same intent does not
 * receive two different capacity budgets.
 */
export function capacityModeForUtterance(
  utterance: string,
  input: InteractionInput
): 'visit' | 'task' {
  const movementIntent =
    /\\b(?:go\\s+see|see\\s+(?:this\\s+|that\\s+|the\\s+)?job|visit|drop\\s+off|pick\\s+up|collect|deliver|drive\\s+to|travel\\s+to|head\\s+to|stop\\s+at|go\\s+to|get\\s+to|go\\s+over\\s+to)\\b/i.test(
      utterance
    );
  if (movementIntent) return 'visit';

  // A short "Can I fit Henderson?" can mean a visit when Henderson is the
  // current job focus. Do not infer travel merely because any job is in focus.
  const focus = input.context.currentFocus;
  const asksAboutFit = /\\b(?:fit|time|available|free|should\\s+i|can\\s+i)\\b/i.test(utterance);
  if (
    focus?.kind === 'job' &&
    focus.label &&
    asksAboutFit &&
    new RegExp('(?:^|[^\\\\p{L}\\\\p{N}])' + escapeRegExp(focus.label) + '(?:$|[^\\\\p{L}\\\\p{N}])', 'iu').test(utterance)
  ) {
    return 'visit';
  }

  return 'task';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\// ANSWER and ACT intentionally share the same V3 fit evaluator below; keep both paths aligned.
');
}

// Resolve only dates we can deterministically anchor. Unknown relative expressions
// must not be treated as if they referred to the currently selected capacity window.
function dateForHint(hint: string | null, todayDate: string): string | null {
  if (!hint) return null;
  const value = hint.trim().toLowerCase();
  if (value === 'today') return todayDate;
  if (value === 'tomorrow') {
    const [year, month, day] = todayDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const weekdays: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };
  const targetDay = weekdays[value];
  if (targetDay === undefined) return null;
  const [year, month, day] = todayDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const delta = (targetDay - date.getUTCDay() + 7) % 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}


export function answerFeasibility(
  utterance: string,
  cycle: EngineCycleResult,
  input: InteractionInput,
  options: { capacityMode?: 'visit' | 'task' } = {}
): InteractionAnswer {
  const facts: string[] = [...cycle.facts];
  const travelCtx = input.context.travel;
  const onTrip = Boolean(travelCtx?.tripId);
  if (onTrip && travelCtx) {
    facts.push(
      `travel_trip=${travelCtx.tripName}`,
      travelCtx.dayDate ? `travel_day=${travelCtx.dayDate}` : 'travel_day=none',
      `travel_planned≈${travelCtx.plannedMins ?? 0}`
    );
    if (travelCtx.baseLocationText) {
      facts.push(`base=${travelCtx.baseLocationText}`);
    }
  }
  const meetings = input.context.meetings ?? [];
  const meetingBlockMins = meetings.reduce((sum, m) => {
    const d = m.durationMins;
    return sum + (typeof d === 'number' && d > 0 ? d : 45);
  }, 0);

  const todayDate =
    input.context.todayDate && /^\d{4}-\d{2}-\d{2}$/.test(input.context.todayDate)
      ? input.context.todayDate
      : new Date().toISOString().slice(0, 10);
  const capacityDate = onTrip && travelCtx?.dayDate ? travelCtx.dayDate : todayDate;
  const hintedDate = dateForHint(cycle.request.dateHint, todayDate);
  // No explicit date means the current selected window; an unresolvable explicit
  // date is unknown, never silently compared with today's remaining minutes.
  const targetDate = cycle.request.dateHint ? hintedDate : capacityDate;
  const capacityApplies = targetDate != null && targetDate === capacityDate;
  let remaining = capacityApplies
    ? onTrip
      ? travelCtx?.remainingMins ?? input.context.remainingMinsToday ?? null
      : input.context.remainingMinsToday ?? null
    : null;
  if (!capacityApplies) {
    facts.push(
      targetDate ? `capacity_window_mismatch=target:${targetDate},available:${capacityDate}` : 'capacity_target_date_unknown'
    );
  }
  // Trip day: meetings on this calendar day consume workable window (same day capacity).
  if (capacityApplies && onTrip && remaining != null && meetingBlockMins > 0) {
    remaining = Math.max(0, remaining - meetingBlockMins);
    facts.push(
      `meetings_on_day=${meetings.length}`,
      `meeting_block≈${meetingBlockMins}`
    );
  }

  const capacityMode = options.capacityMode ?? capacityModeForUtterance(utterance, input);\n  const visitMode = capacityMode === 'visit';
  const visit =
    input.context.visitDurationMins ??
    (cycle.request.objectText ? 45 : 30);
  // Ordinary captured work uses its task estimate; only explicit movement/visit
  // work should consume the visit + travel budget.
  const actionEstimate =
    cycle.action.kind === 'create_task' || cycle.action.kind === 'update_task'
      ? cycle.action.estimateMins
      : null;
  const taskEstimate =
    typeof actionEstimate === 'number' && actionEstimate > 0
      ? actionEstimate
      : 15;
  // On a trip day, travel is already partly in planned drives; default lower leg cost.
  const travel = visitMode
    ? input.context.travelMins ?? (onTrip ? 15 : 20)
    : 0;
  const roundTrip = visitMode ? (onTrip ? travel : travel * 2) : 0;
  const needed = visitMode ? visit + roundTrip : Math.max(0, taskEstimate);

  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const afternoonHint =
    /\bafternoon\b/i.test(utterance) || cycle.request.timeHint === 'afternoon';

  // For trip days that are not "today", anchor "until meeting" to the day start so
  // future-day meetings still pressure the answer instead of looking hours away from now.
  let refMs = nowMs;
  if (onTrip && travelCtx?.dayDate && travelCtx.dayDate !== nowIso.slice(0, 10)) {
    const dayStartMins = travelCtx.dayStartMins ?? 8 * 60;
    const [y, mo, d] = travelCtx.dayDate.split('-').map((n) => parseInt(n, 10));
    refMs = new Date(y, mo - 1, d, Math.floor(dayStartMins / 60), dayStartMins % 60).getTime();
  }

  let hardBlock: string | null = null;
  let minsToNextCommitment: number | null = null;
  for (const m of meetings) {
    if (!m.startAt) continue;
    const start = Date.parse(m.startAt);
    if (Number.isNaN(start)) continue;
    if (start > refMs) {
      const minsUntil = Math.round((start - refMs) / 60000);
      if (minsToNextCommitment == null || minsUntil < minsToNextCommitment) {
        minsToNextCommitment = minsUntil;
      }
      if (minsUntil < 4 * 60) {
        if (minsUntil < needed + 15) {
          hardBlock = `Meeting "${m.text}" in ~${minsUntil} min`;
          facts.push(hardBlock);
        } else {
          facts.push(`Meeting "${m.text}" in ~${minsUntil} min — room after/before.`);
        }
      } else {
        facts.push(`Meeting "${m.text}" later that day (~${minsUntil} min from day start).`);
      }
    } else if (onTrip) {
      facts.push(`Meeting "${m.text}" already started or past on this day.`);
    }
  }

  // Thinking Engine V3 — real fit over capacity + calendar pressure (orchestrate, do not duplicate).
  let fitState: string | null = null;
  let decision: Decision | null = null;
  let decisionTrace: DecisionTrace | null = null;
  let v3Fits: boolean | null = null;

  if (remaining != null) {
    const fitDecision = decideTaskFit({
      capacityMins: needed,
      remainingWindowMins: remaining,
      sameDayRate: null,
      protectFromCarry: false,
      dueToday: capacityApplies && Boolean(cycle.request.dateHint),
      hasIntendedTime: capacityApplies && Boolean(
        cycle.request.timeHint || (visitMode && afternoonHint)
      ),
      isActive: false,
      behaviour: null,
      clusterBehaviour: null,
      duration: null,
      calendar: {
        remainingWindowMins: remaining,
        minsToNextCommitment,
        meetingDensity: meetings.length > 0 ? Math.min(1, meetings.length / 4) : 0,
      },
      softFloorMins: visitMode ? visit : Math.min(15, Math.max(1, taskEstimate)),
    });
    fitState = fitDecision.fit;
    facts.push(`v3_fit=${fitDecision.fit}`, `v3_confidence=${fitDecision.confidence}`);
    for (const reason of fitDecision.reasons.slice(0, 4)) {
      facts.push(`v3:${reason}`);
    }
    const dec = decisionFromFit(fitDecision, {
      typedEstimateMins: needed,
      contextAt: nowIso,
      // Trace references must point to real engine evidence, not synthetic IDs
      // derived from human-readable explanations or diagnostic facts.
      evidenceIds: cycle.evidence.map((e) => e.id),
    });
    decision = dec;
    decisionTrace = traceFromFit(fitDecision, dec, {
      typedEstimateMins: needed,
      contextAt: nowIso,
    });
    // FitState: strong | possible | poor | blocked | unknown | protect | carry_safe | needs_context | uncertain
    v3Fits =
      fitDecision.fit === 'strong' || fitDecision.fit === 'possible'
        ? true
        : fitDecision.fit === 'blocked' ||
            fitDecision.fit === 'protect' ||
            fitDecision.fit === 'poor'
          ? false
          : null;
  }

  let fits: boolean | null = null;
  let textOut = '';

  const dayLabel = onTrip && capacityApplies
    ? travelCtx?.dayDate
      ? `on ${travelCtx.dayDate}`
      : 'on this trip day'
    : targetDate && targetDate !== todayDate
      ? `on ${targetDate}`
      : 'today';
  const travelPhrase = onTrip
    ? `~${roundTrip} min leg`
    : `~${roundTrip} min round-trip`;

  if (remaining == null) {
    fits = null;
    textOut = !capacityApplies && targetDate
      ? `I do not have a clear remaining-capacity signal for ${dayLabel}, so I cannot confirm a fit. The available capacity belongs to a different day.`
      : onTrip
        ? 'I do not have a clear remaining-capacity signal for this trip day, so I cannot confirm a fit. Check the day window and planned stops.'
        : 'I do not have a clear remaining-capacity signal for today, so I cannot confirm a fit. Check your calendar and open work before committing.';
    facts.push('remainingMinsToday unavailable');
  } else if (hardBlock && remaining < needed) {
    fits = false;
    textOut = `Tight. ${hardBlock}, and you only have about ${remaining} minutes of workable time ${dayLabel}. ${requiredWorkPhrase} needs roughly ${needed} minutes.`;
  } else if (v3Fits === false || remaining < needed) {
    fits = false;
    const pushNote =
      fitState === 'protect' || fitState === 'blocked'
        ? ' Existing commitments should stay put unless you move them.'
        : onTrip
          ? ' It would push other stops on this day.'
          : ' It would push other planned work.';
    textOut = `Not comfortably. About ${remaining} minutes remain ${dayLabel}; ${neededWorkPhrase}.${pushNote}`;
    facts.push(`remaining=${remaining}`, `needed≈${needed}`, 'over_capacity');
  } else if (remaining >= needed + 15 && (v3Fits === true || v3Fits === null)) {
    fits = true;
    const spare = remaining - needed;
    textOut = afternoonHint
      ? `Yes. You can fit a visit this afternoon ${dayLabel}. After travel and ~${visit} minutes on site you should still have about ${spare} minutes when you get back.`
      : visitMode\n        ? `Yes. Roughly ${remaining} minutes remain ${dayLabel}; the stop needs about ${needed} minutes including travel, leaving ~${spare} minutes.`\n        : `Yes. Roughly ${remaining} minutes remain ${dayLabel}; this task needs about ${needed} minutes, leaving ~${spare} minutes.`;
    facts.push(`remaining=${remaining}`, `needed≈${needed}`, `spare≈${spare}`);
  } else if (remaining >= needed) {
    fits = true;
    textOut = visitMode\n      ? `You can, but it is tight. About ${remaining} minutes remain ${dayLabel} and the visit plus travel is ~${needed} minutes — little buffer if anything overruns.`\n      : `You can, but it is tight. About ${remaining} minutes remain ${dayLabel} and this task needs ~${needed} minutes — little buffer if anything overruns.`;
    facts.push(`remaining=${remaining}`, `needed≈${needed}`, 'tight_fit');
  } else {
    fits = false;
    textOut = `Not comfortably. About ${remaining} minutes remain ${dayLabel}; ${neededWorkPhrase}. It would push other planned work.`;
    facts.push(`remaining=${remaining}`, `needed≈${needed}`, 'over_capacity');
  }

  const focus = input.context.currentFocus;
  if (focus?.kind === 'job' && focus.label) {
    facts.push(`focus_job=${focus.label}`);
  }

  return {
    text: textOut,
    fits,
    evidence: facts,
    confidence: remaining != null ? (decision?.confidence.overall ?? 'medium') : 'low',
    fitState,
    decision,
    decisionTrace,
  };
}

/**
 * Light fit Decision for ACT — reuses the same V3 evaluator as ANSWER, but
 * sizes the work correctly: visit/travel only for explicit movement intent,
 * otherwise the task's own estimate. Capacity remains advisory and never vetoes capture.
 */
export function actFitDecision(
  cycle: EngineCycleResult,
  input: InteractionInput
): {
  fitState: string | null;
  decision: Decision | null;
  decisionTrace: DecisionTrace | null;
  facts: string[];
} {
  const capacityMode = capacityModeForUtterance(input.input.text, input);\n  const answer = answerFeasibility('', cycle, input, {
    capacityMode,
  });
  return {
    fitState: answer.fitState ?? null,
    decision: answer.decision ?? null,
    decisionTrace: answer.decisionTrace ?? null,
    facts: answer.evidence,
  };
}
