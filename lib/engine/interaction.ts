/**
 * Thin Interaction Contract — Personal Operating Engine entry point.
 *
 * CaptureSheet (and future Android / Auto clients) call processInteraction.
 * The engine no longer assumes "I was called because CaptureSheet docked".
 *
 * Outcomes:
 *   ACT     → state mutation (existing task service performs it)
 *   ANSWER  → reasoning result, no mutation
 *   DEFER   → persistent contextual intention (not flattened to task)
 *   CLARIFY → insufficient confidence / ambiguity
 *   NO_OP   → nothing safely actionable
 */

import type {
  EngineAction,
  EngineCycleResult,
  EngineRequest,
  LearningEvidence,
  WorkingMemorySnapshot,
  AuthorityDecision,
  Confidence,
} from './types';
import { runEngineCycle, type CycleInput } from './orchestrate';
import {
  detectDeferredIntention,
  saveDeferredIntentionLocal,
  type DeferredIntention,
} from './deferredIntention';
import { resolveReference, containsReference } from './references';
import { resolveJobName } from './contextAssembly';
import { setFocus } from './workingMemory';
import {
  loadWorkingMemoryLocal,
  saveWorkingMemoryLocal,
  loadActiveRequestLocal,
  saveActiveRequestLocal,
  appendEvidenceLocal,
} from './persist';

export type InteractionInputType = 'text' | 'speech_transcript' | 'structured';

export type InteractionInput = {
  userId: string | null;
  input: {
    type: InteractionInputType;
    text: string;
    confidence?: Confidence;
  };
  context: {
    /** e.g. 'capture' | 'today' | 'jobs' | 'voice' */
    interface: string;
    activity?: string | null;
    surface?: string | null;
    currentFocus?: {
      kind: 'task' | 'job' | 'list' | 'meeting' | 'request' | 'none';
      id: string | null;
      label: string | null;
    } | null;
    jobs?: Array<{ id: string; name: string; locationText?: string | null }>;
    meetings?: Array<{ id: string; text: string; startAt?: string | null }>;
    remainingMinsToday?: number | null;
    openTaskCount?: number;
    todayDate?: string;
    visitDurationMins?: number | null;
    travelMins?: number | null;
  };
  priorRequest?: EngineRequest | null;
  workingMemory?: WorkingMemorySnapshot;
  dryRun?: boolean;
};

export type InteractionOutcomeKind = 'ACT' | 'ANSWER' | 'DEFER' | 'CLARIFY' | 'NO_OP';

export type InteractionAnswer = {
  text: string;
  fits: boolean | null;
  evidence: string[];
  confidence: Confidence;
};

export type InteractionResult = {
  outcome: InteractionOutcomeKind;
  message: string;
  action: EngineAction | null;
  answer: InteractionAnswer | null;
  deferred: DeferredIntention | null;
  clarify: {
    question: string;
    candidates: Array<{ id: string; label: string; kind: string }>;
  } | null;
  request: EngineRequest;
  workingMemory: WorkingMemorySnapshot;
  authority: AuthorityDecision;
  evidence: LearningEvidence[];
  facts: string[];
  explanation: string;
  cycle: EngineCycleResult | null;
  confidence: Confidence;
};

function isQueryUtterance(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(?:have\s+i\s+got\s+time|do\s+i\s+have\s+time|can\s+i\s+(?:fit|make|go|see)|is\s+there\s+time|will\s+it\s+fit|should\s+i)\b/i.test(
      lower
    ) ||
    (/\?\s*$/.test(text.trim()) &&
      /\b(?:time|fit|free|available|afternoon|morning)\b/i.test(lower))
  );
}

function isAddToJobPattern(text: string): {
  objectText: string | null;
  jobRef: string | null;
} {
  const m =
    text.match(
      /\b(?:add|put|attach|link)\s+(.+?)\s+(?:to|on)\s+(?:this\s+job|that\s+job|the\s+job|(?:the\s+)?([A-Z][\w][\w\s-]{0,40}?)(?:\s+job)?)\b/i
    ) ||
    text.match(
      /\b(?:can\s+you\s+)?(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:this\s+job|that\s+job)\b/i
    );
  if (!m) return { objectText: null, jobRef: null };
  const objectText = (m[1] || '').replace(/\s+/g, ' ').trim();
  const named = m[2]?.trim() || null;
  const lower = text.toLowerCase();
  const jobRef = named || (/this\s+job|that\s+job|the\s+job/i.test(lower) ? 'this_job' : null);
  return { objectText: objectText || null, jobRef };
}

function answerFeasibility(
  utterance: string,
  cycle: EngineCycleResult,
  input: InteractionInput
): InteractionAnswer {
  const facts: string[] = [...cycle.facts];
  const remaining = input.context.remainingMinsToday;
  const visit =
    input.context.visitDurationMins ??
    (cycle.request.objectText ? 45 : 30);
  const travel = input.context.travelMins ?? 20;
  const roundTrip = travel * 2;
  const needed = visit + roundTrip;

  const meetings = input.context.meetings ?? [];
  const nowIso = new Date().toISOString();
  const afternoonHint =
    /\bafternoon\b/i.test(utterance) || cycle.request.timeHint === 'afternoon';

  let hardBlock: string | null = null;
  for (const m of meetings) {
    if (!m.startAt) continue;
    const start = Date.parse(m.startAt);
    const now = Date.parse(nowIso);
    if (start > now && start - now < 4 * 60 * 60 * 1000) {
      const minsUntil = Math.round((start - now) / 60000);
      if (minsUntil < needed + 15) {
        hardBlock = `Meeting "${m.text}" in ~${minsUntil} min`;
        facts.push(hardBlock);
      } else {
        facts.push(`Meeting "${m.text}" in ~${minsUntil} min — room after/before.`);
      }
    }
  }

  let fits: boolean | null = null;
  let textOut = '';

  if (remaining == null) {
    fits = null;
    textOut =
      'I do not have a clear remaining-capacity signal for today, so I cannot confirm a fit. Check your calendar and open work before committing.';
    facts.push('remainingMinsToday unavailable');
  } else if (hardBlock && remaining < needed) {
    fits = false;
    textOut = `Tight. ${hardBlock}, and you only have about ${remaining} minutes of workable time. A visit (~${visit} min) plus travel (~${roundTrip} min round-trip) needs roughly ${needed} minutes.`;
  } else if (remaining >= needed + 15) {
    fits = true;
    const spare = remaining - needed;
    textOut = afternoonHint
      ? `Yes. You can fit a visit this afternoon. After travel and ~${visit} minutes on site you should still have about ${spare} minutes of workable time when you get back.`
      : `Yes. Roughly ${remaining} minutes remain; the visit needs about ${needed} minutes including travel, leaving ~${spare} minutes.`;
    facts.push(`remaining=${remaining}`, `needed≈${needed}`, `spare≈${spare}`);
  } else if (remaining >= needed) {
    fits = true;
    textOut = `You can, but it is tight. About ${remaining} minutes remain and the visit plus travel is ~${needed} minutes — little buffer if anything overruns.`;
    facts.push(`remaining=${remaining}`, `needed≈${needed}`, 'tight_fit');
  } else {
    fits = false;
    textOut = `Not comfortably. About ${remaining} minutes remain; a visit plus travel needs ~${needed} minutes. It would push other planned work.`;
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
    confidence: remaining != null ? 'medium' : 'low',
  };
}

function clarifyFromAmbiguity(
  reason: string,
  candidates: Array<{ id: string; label: string; kind: string }>,
  cycle: EngineCycleResult
): InteractionResult {
  return {
    outcome: 'CLARIFY',
    message: reason,
    action: null,
    answer: null,
    deferred: null,
    clarify: { question: reason, candidates },
    request: cycle.request,
    workingMemory: cycle.workingMemory,
    authority: cycle.authority,
    evidence: cycle.evidence,
    facts: cycle.facts,
    explanation: cycle.explanation,
    cycle,
    confidence: 'low',
  };
}

/** Primary entry — one interaction cycle. */
export function processInteraction(input: InteractionInput): InteractionResult {
  const text = input.input.text.replace(/\s+/g, ' ').trim();
  const userId = input.userId;

  let mem =
    input.workingMemory ??
    (input.dryRun ? undefined : loadWorkingMemoryLocal(userId));
  const prior =
    input.priorRequest ??
    (input.dryRun ? null : loadActiveRequestLocal(userId));

  if (input.context.currentFocus?.id && mem) {
    mem = setFocus(mem, input.context.currentFocus);
  }

  // --- DEFER ---
  const deferred = detectDeferredIntention(text, {
    userId,
    requestId: prior?.id ?? null,
  });
  if (deferred) {
    if (!input.dryRun) saveDeferredIntentionLocal(deferred, userId);
    const cycle = runEngineCycle({
      utterance: text,
      priorRequest: prior,
      workingMemory: mem,
      todayDate: input.context.todayDate,
      context: {
        jobs: input.context.jobs,
        meetings: input.context.meetings,
        remainingMinsToday: input.context.remainingMinsToday,
        openTaskCount: input.context.openTaskCount,
        surfaceDate: input.context.surface ?? null,
        workingMemory: mem,
      },
    });
    const evidence: LearningEvidence[] = [
      ...cycle.evidence,
      {
        id: `ev_def_${Date.now().toString(36)}`,
        kind: 'interpretation',
        timestamp: new Date().toISOString(),
        requestId: cycle.request.id,
        payload: {
          deferredId: deferred.id,
          trigger: deferred.trigger,
          executionReady: false,
        },
      },
    ];
    if (!input.dryRun) {
      saveWorkingMemoryLocal(cycle.workingMemory, userId);
      saveActiveRequestLocal(cycle.request, userId);
      appendEvidenceLocal(evidence, userId);
    }
    return {
      outcome: 'DEFER',
      message: `I'll hold that for when you're back at the ${deferred.trigger.label}. (Arrival trigger is not live yet — intention is stored.)`,
      action: { kind: 'noop', message: 'deferred_intention' },
      answer: null,
      deferred,
      clarify: null,
      request: cycle.request,
      workingMemory: cycle.workingMemory,
      authority: cycle.authority,
      evidence,
      facts: [
        ...cycle.facts,
        `deferred:${deferred.trigger.type}:${deferred.trigger.label}`,
        'execution_not_claimed',
      ],
      explanation: `Contextual intention stored: ${deferred.actionText}. Trigger: ${deferred.trigger.type} (${deferred.trigger.label}). Not an ordinary task.`,
      cycle,
      confidence: 'medium',
    };
  }

  const addPat = isAddToJobPattern(text);
  let forcedJobId: string | null = null;
  let forcedJobName: string | null = null;

  if (addPat.jobRef === 'this_job' || /\bthis\s+job\b/i.test(text)) {
    const focus = input.context.currentFocus;
    const jobs = input.context.jobs ?? [];
    if (focus?.kind === 'job' && focus.id) {
      forcedJobId = focus.id;
      forcedJobName = focus.label;
    } else if (jobs.length === 1) {
      forcedJobId = jobs[0].id;
      forcedJobName = jobs[0].name;
    } else if (jobs.length > 1) {
      const cycleStub = runEngineCycle({
        utterance: text,
        priorRequest: prior,
        workingMemory: mem,
        todayDate: input.context.todayDate,
        context: {
          jobs,
          meetings: input.context.meetings,
          remainingMinsToday: input.context.remainingMinsToday,
          openTaskCount: input.context.openTaskCount,
          workingMemory: mem,
        },
      });
      return clarifyFromAmbiguity(
        'Which job did you mean?',
        jobs.slice(0, 5).map((j) => ({ id: j.id, label: j.name, kind: 'job' })),
        cycleStub
      );
    }
  } else if (addPat.jobRef && addPat.jobRef !== 'this_job') {
    const hit = resolveJobName(addPat.jobRef, input.context.jobs ?? []);
    if (hit) {
      forcedJobId = hit.id;
      forcedJobName = hit.name;
    } else if ((input.context.jobs ?? []).length > 1) {
      const cycleStub = runEngineCycle({
        utterance: text,
        priorRequest: prior,
        workingMemory: mem,
        todayDate: input.context.todayDate,
        context: { jobs: input.context.jobs, workingMemory: mem },
      });
      return clarifyFromAmbiguity(
        `I could not uniquely match job "${addPat.jobRef}". Which job?`,
        (input.context.jobs ?? []).slice(0, 5).map((j) => ({
          id: j.id,
          label: j.name,
          kind: 'job',
        })),
        cycleStub
      );
    }
  }

  if (containsReference(text) && mem) {
    const ref = resolveReference(text, mem);
    if (ref.status === 'ambiguous') {
      const cycleStub = runEngineCycle({
        utterance: text,
        priorRequest: prior,
        workingMemory: mem,
        todayDate: input.context.todayDate,
        context: { jobs: input.context.jobs, workingMemory: mem },
      });
      return clarifyFromAmbiguity(
        'Which one did you mean?',
        ref.candidates.map((c) => ({
          id: c.id,
          label: c.label,
          kind: c.type,
        })),
        cycleStub
      );
    }
  }

  const cycleInput: CycleInput = {
    utterance: text,
    priorRequest: prior,
    workingMemory: mem,
    todayDate: input.context.todayDate,
    context: {
      jobs: input.context.jobs,
      meetings: input.context.meetings,
      remainingMinsToday: input.context.remainingMinsToday,
      openTaskCount: input.context.openTaskCount,
      surfaceDate: input.context.surface ?? null,
      workingMemory: mem,
    },
  };

  const cycle = runEngineCycle(cycleInput);

  let action: EngineAction = cycle.action;
  if (
    forcedJobId &&
    (action.kind === 'create_task' || action.kind === 'update_task')
  ) {
    action = { ...action, jobId: forcedJobId };
    if (addPat.objectText && action.kind === 'create_task') {
      action = { ...action, text: addPat.objectText };
    }
  }

  if (forcedJobName && !cycle.request.relatedJobText) {
    cycle.request.relatedJobText = forcedJobName;
  }
  if (addPat.objectText) {
    if (!cycle.request.objectText) cycle.request.objectText = addPat.objectText;
    if (cycle.request.action === 'unknown') cycle.request.action = 'create_task';
    if (cycle.request.confidence === 'low') cycle.request.confidence = 'medium';
  }

  if (
    addPat.objectText &&
    forcedJobId &&
    action.kind !== 'create_task' &&
    action.kind !== 'update_task'
  ) {
    action = {
      kind: 'create_task',
      text: addPat.objectText,
      locationText: cycle.request.locationText,
      jobId: forcedJobId,
      surfaceDate: null,
      estimateMins: 15,
    };
  }

  if (!input.dryRun) {
    saveWorkingMemoryLocal(cycle.workingMemory, userId);
    saveActiveRequestLocal(cycle.request, userId);
    appendEvidenceLocal(cycle.evidence, userId);
  }

  if (isQueryUtterance(text) || cycle.request.action === 'query') {
    const answer = answerFeasibility(text, cycle, input);
    return {
      outcome: 'ANSWER',
      message: answer.text,
      action: null,
      answer,
      deferred: null,
      clarify: null,
      request: cycle.request,
      workingMemory: cycle.workingMemory,
      authority: cycle.authority,
      evidence: cycle.evidence,
      facts: answer.evidence,
      explanation: answer.text,
      cycle,
      confidence: answer.confidence,
    };
  }

  const canAct =
    (action.kind === 'create_task' || action.kind === 'update_task') &&
    (cycle.authority.mayAct || (!!addPat.objectText && !!forcedJobId)) &&
    (!!cycle.request.objectText || !!addPat.objectText);

  if (canAct) {
    return {
      outcome: 'ACT',
      message:
        cycle.explanation ||
        `Add "${addPat.objectText || cycle.request.objectText}"`,
      action,
      answer: null,
      deferred: null,
      clarify: null,
      request: cycle.request,
      workingMemory: cycle.workingMemory,
      authority: {
        ...cycle.authority,
        mayAct: true,
        reason: cycle.authority.mayAct
          ? cycle.authority.reason
          : 'add_to_job_pattern',
      },
      evidence: cycle.evidence,
      facts: [
        ...cycle.facts,
        ...(forcedJobName ? [`job=${forcedJobName}`] : []),
      ],
      explanation: cycle.explanation,
      cycle,
      confidence: cycle.request.confidence,
    };
  }

  if (action.kind === 'ask' || action.kind === 'suggest') {
    return {
      outcome: 'CLARIFY',
      message: action.message,
      action: null,
      answer: null,
      deferred: null,
      clarify: { question: action.message, candidates: [] },
      request: cycle.request,
      workingMemory: cycle.workingMemory,
      authority: cycle.authority,
      evidence: cycle.evidence,
      facts: cycle.facts,
      explanation: cycle.explanation,
      cycle,
      confidence: cycle.request.confidence,
    };
  }

  return {
    outcome: 'NO_OP',
    message: cycle.explanation || 'Nothing actionable yet.',
    action: action.kind === 'noop' ? action : { kind: 'noop', message: 'no_op' },
    answer: null,
    deferred: null,
    clarify: null,
    request: cycle.request,
    workingMemory: cycle.workingMemory,
    authority: cycle.authority,
    evidence: cycle.evidence,
    facts: cycle.facts,
    explanation: cycle.explanation,
    cycle,
    confidence: cycle.request.confidence,
  };
}
