/**
 * Feasibility ANSWER — orchestrates V3 decideTaskFit + DecisionTrace.
 */

import type { EngineCycleResult } from './types';
import type { InteractionInput, InteractionAnswer } from './interactionTypes';
import { decideTaskFit } from '@/lib/thinking/v3/fit';
import { decisionFromFit, traceFromFit } from '@/lib/thinking/v3/decisionTrace';
import type { Decision, DecisionTrace } from '@/lib/thinking/v3/types';

export function answerFeasibility(
  utterance: string,
  cycle: EngineCycleResult,
  input: InteractionInput
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

  let remaining =
    input.context.remainingMinsToday ?? travelCtx?.remainingMins ?? null;
  // Trip day: meetings on this calendar day consume workable window (same day capacity).
  if (onTrip && remaining != null && meetingBlockMins > 0) {
    remaining = Math.max(0, remaining - meetingBlockMins);
    facts.push(
      `meetings_on_day=${meetings.length}`,
      `meeting_block≈${meetingBlockMins}`
    );
  }

  const visit =
    input.context.visitDurationMins ??
    (cycle.request.objectText ? 45 : 30);
  // On a trip day, travel is already partly in planned drives; default lower leg cost.
  const travel = input.context.travelMins ?? (onTrip ? 15 : 20);
  const roundTrip = onTrip ? travel : travel * 2;
  const needed = visit + roundTrip;

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
      dueToday: true,
      hasIntendedTime: afternoonHint,
      isActive: false,
      behaviour: null,
      clusterBehaviour: null,
      duration: null,
      calendar: {
        remainingWindowMins: remaining,
        minsToNextCommitment,
        meetingDensity: meetings.length > 0 ? Math.min(1, meetings.length / 4) : 0,
      },
      softFloorMins: visit,
    });
    fitState = fitDecision.fit;
    facts.push(`v3_fit=${fitDecision.fit}`, `v3_confidence=${fitDecision.confidence}`);
    for (const reason of fitDecision.reasons.slice(0, 4)) {
      facts.push(`v3:${reason}`);
    }
    const dec = decisionFromFit(fitDecision, {
      typedEstimateMins: needed,
      contextAt: nowIso,
      evidenceIds: facts.slice(0, 8).map((f, i) => `ans-${i}-${f.slice(0, 24)}`),
    });
    decision = dec;
    decisionTrace = traceFromFit(fitDecision, dec, {
      typedEstimateMins: needed,
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

  const dayLabel = onTrip
    ? travelCtx?.dayDate
      ? `on ${travelCtx.dayDate}`
      : 'on this trip day'
    : 'today';
  const travelPhrase = onTrip
    ? `~${roundTrip} min leg`
    : `~${roundTrip} min round-trip`;

  if (remaining == null) {
    fits = null;
    textOut = onTrip
      ? 'I do not have a clear remaining-capacity signal for this trip day, so I cannot confirm a fit. Check the day window and planned stops.'
      : 'I do not have a clear remaining-capacity signal for today, so I cannot confirm a fit. Check your calendar and open work before committing.';
    facts.push('remainingMinsToday unavailable');
  } else if (hardBlock && remaining < needed) {
    fits = false;
    textOut = `Tight. ${hardBlock}, and you only have about ${remaining} minutes of workable time ${dayLabel}. A visit (~${visit} min) plus travel (${travelPhrase}) needs roughly ${needed} minutes.`;
  } else if (v3Fits === false || remaining < needed) {
    fits = false;
    const pushNote =
      fitState === 'protect' || fitState === 'blocked'
        ? ' Existing commitments should stay put unless you move them.'
        : onTrip
          ? ' It would push other stops on this day.'
          : ' It would push other planned work.';
    textOut = `Not comfortably. About ${remaining} minutes remain ${dayLabel}; a visit plus travel needs ~${needed} minutes.${pushNote}`;
    facts.push(`remaining=${remaining}`, `needed≈${needed}`, 'over_capacity');
  } else if (remaining >= needed + 15 && (v3Fits === true || v3Fits === null)) {
    fits = true;
    const spare = remaining - needed;
    textOut = afternoonHint
      ? `Yes. You can fit a visit this afternoon ${dayLabel}. After travel and ~${visit} minutes on site you should still have about ${spare} minutes when you get back.`
      : `Yes. Roughly ${remaining} minutes remain ${dayLabel}; the stop needs about ${needed} minutes including travel, leaving ~${spare} minutes.`;
    facts.push(`remaining=${remaining}`, `needed≈${needed}`, `spare≈${spare}`);
  } else if (remaining >= needed) {
    fits = true;
    textOut = `You can, but it is tight. About ${remaining} minutes remain ${dayLabel} and the visit plus travel is ~${needed} minutes — little buffer if anything overruns.`;
    facts.push(`remaining=${remaining}`, `needed≈${needed}`, 'tight_fit');
  } else {
    fits = false;
    textOut = `Not comfortably. About ${remaining} minutes remain ${dayLabel}; a visit plus travel needs ~${needed} minutes. It would push other planned work.`;
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
 * Light fit Decision for ACT — same V3 path as ANSWER, no second architecture.
 * Does not block ACT; attaches DecisionTrace so authority is auditable.
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
  const facts: string[] = [];
  const remaining = input.context.remainingMinsToday;
  if (remaining == null) {
    return { fitState: null, decision: null, decisionTrace: null, facts: ['act_fit:no_remaining'] };
  }

  const estimate =
    (cycle.action.kind === 'create_task' || cycle.action.kind === 'update_task'
      ? cycle.action.estimateMins
      : null) ?? 30;
  const travel = input.context.travelMins ?? 0;
  const capacityMins = Math.max(estimate, 15) + travel;

  const meetings = input.context.meetings ?? [];
  const nowMs = Date.now();
  let minsToNextCommitment: number | null = null;
  for (const m of meetings) {
    if (!m.startAt) continue;
    const start = Date.parse(m.startAt);
    if (start > nowMs) {
      const minsUntil = Math.round((start - nowMs) / 60000);
      if (minsToNextCommitment == null || minsUntil < minsToNextCommitment) {
        minsToNextCommitment = minsUntil;
      }
    }
  }

  const fitDecision = decideTaskFit({
    capacityMins,
    remainingWindowMins: remaining,
    sameDayRate: null,
    protectFromCarry: false,
    dueToday: true,
    hasIntendedTime: !!cycle.request.timeHint,
    isActive: false,
    behaviour: null,
    clusterBehaviour: null,
    duration: null,
    calendar: {
      remainingWindowMins: remaining,
      minsToNextCommitment,
      meetingDensity: meetings.length > 0 ? Math.min(1, meetings.length / 4) : 0,
    },
    softFloorMins: estimate,
  });

  facts.push(`v3_fit=${fitDecision.fit}`, `v3_confidence=${fitDecision.confidence}`);
  for (const reason of fitDecision.reasons.slice(0, 4)) {
    facts.push(`v3:${reason}`);
  }

  const decision = decisionFromFit(fitDecision, {
    typedEstimateMins: capacityMins,
    contextAt: new Date().toISOString(),
    evidenceIds: facts.slice(0, 8).map((f, i) => `act-${i}-${f.slice(0, 24)}`),
  });
  const decisionTrace = traceFromFit(fitDecision, decision, {
    typedEstimateMins: capacityMins,
  });

  return {
    fitState: fitDecision.fit,
    decision,
    decisionTrace,
    facts,
  };
}
