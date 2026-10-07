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
import { emptyWorkingMemory, setFocus } from './workingMemory';
import {
  loadWorkingMemoryLocal,
  saveWorkingMemoryLocal,
  loadActiveRequestLocal,
  saveActiveRequestLocal,
  appendEvidenceLocal,
} from './persist';

import type {
  InteractionInput,
  InteractionInputType,
  InteractionOutcomeKind,
  InteractionAnswer,
  InteractionResult,
} from './interactionTypes';
export type {
  InteractionInput,
  InteractionInputType,
  InteractionOutcomeKind,
  InteractionAnswer,
  InteractionResult,
} from './interactionTypes';
import { answerFeasibility, actFitDecision } from './interactionAnswer';
import type { TravelReasoningSlice } from './types';

function travelSliceFromInput(input: InteractionInput): TravelReasoningSlice | null {
  const t = input.context.travel;
  if (!t?.tripId) return null;
  return {
    tripId: t.tripId,
    tripName: t.tripName,
    intent: t.intent ?? null,
    dayId: t.dayId ?? null,
    dayDate: t.dayDate ?? null,
    remainingMins: t.remainingMins ?? null,
    plannedMins: t.plannedMins ?? 0,
    baseLocationText: t.baseLocationText ?? null,
  };
}

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
export function processInteractionCore(input: InteractionInput): InteractionResult {
  const text = input.input.text.replace(/\s+/g, ' ').trim();
  const userId = input.userId;

  let mem =
    input.workingMemory ??
    (input.dryRun ? undefined : loadWorkingMemoryLocal(userId)) ??
    emptyWorkingMemory();
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
        remainingMinsToday:
          input.context.remainingMinsToday ??
          input.context.travel?.remainingMins ??
          null,
        openTaskCount: input.context.openTaskCount,
        surfaceDate: input.context.surface ?? null,
        workingMemory: mem,
        travel: travelSliceFromInput(input),
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

  if (containsReference(text)) {
    // Current context is evidence for reference resolution, not a new memory
    // system. Supply current jobs/meetings as ephemeral candidates so phrases
    // such as "update that job" can be clarified even when those entities have
    // not yet entered working memory.
    const contextReferents = [
      ...(input.context.jobs ?? []).map((job) => ({
        id: job.id,
        type: 'job' as const,
        label: job.name,
        source: 'current_context',
        timestamp: new Date().toISOString(),
        salience: 0.55,
        confidence: 'medium' as const,
        relationships: {},
      })),
      ...(input.context.meetings ?? []).map((meeting) => ({
        id: meeting.id,
        type: 'meeting' as const,
        label: meeting.text,
        source: 'current_context',
        timestamp: new Date().toISOString(),
        salience: 0.55,
        confidence: 'medium' as const,
        relationships: {},
      })),
    ];
    const ref = resolveReference(text, mem, { extraReferents: contextReferents });
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
      remainingMinsToday:
        input.context.remainingMinsToday ??
        input.context.travel?.remainingMins ??
        null,
      openTaskCount: input.context.openTaskCount,
      surfaceDate: input.context.surface ?? null,
      workingMemory: mem,
      travel: travelSliceFromInput(input),
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

  // Keep the orchestrated cycle immutable. Special capture patterns can enrich
  // the request returned to the surface, but never mutate cycle.request.
  const request: EngineRequest = {
    ...cycle.request,
    relatedJobText:
      !cycle.request.relatedJobText && forcedJobName
        ? forcedJobName
        : cycle.request.relatedJobText,
    objectText:
      !cycle.request.objectText && addPat.objectText
        ? addPat.objectText
        : cycle.request.objectText,
    action:
      cycle.request.action === 'unknown' && addPat.objectText
        ? 'create_task'
        : cycle.request.action,
    confidence:
      cycle.request.confidence === 'low' && addPat.objectText
        ? 'medium'
        : cycle.request.confidence,
  };

  if (
    addPat.objectText &&
    forcedJobId &&
    action.kind !== 'create_task' &&
    action.kind !== 'update_task'
  ) {
    action = {
      kind: 'create_task',
      text: addPat.objectText,
      locationText: request.locationText,
      jobId: forcedJobId,
      surfaceDate: null,
      estimateMins: 15,
    };
  }

  if (!input.dryRun) {
    saveWorkingMemoryLocal(cycle.workingMemory, userId);
    saveActiveRequestLocal(request, userId);
    appendEvidenceLocal(cycle.evidence, userId);
  }

  if (isQueryUtterance(text) || request.action === 'query') {
    const answer = answerFeasibility(text, cycle, input);
    return {
      outcome: 'ANSWER',
      message: answer.text,
      action: null,
      answer,
      deferred: null,
      clarify: null,
      request,
      workingMemory: cycle.workingMemory,
      authority: cycle.authority,
      evidence: cycle.evidence,
      facts: answer.evidence,
      explanation: answer.text,
      cycle,
      confidence: answer.confidence,
      decision: answer.decision ?? null,
      decisionTrace: answer.decisionTrace ?? null,
      fitState: answer.fitState ?? null,
    };
  }

  const canAct =
    (action.kind === 'create_task' || action.kind === 'update_task') &&
    (cycle.authority.mayAct || (!!addPat.objectText && !!forcedJobId)) &&
    (!!request.objectText || !!addPat.objectText);

  if (canAct) {
    const actFit = actFitDecision(cycle, input);
    return {
      outcome: 'ACT',
      message:
        cycle.explanation ||
        `Add "${addPat.objectText || request.objectText}"`,
      action,
      answer: null,
      deferred: null,
      clarify: null,
      request,
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
        ...actFit.facts,
      ],
      explanation: cycle.explanation,
      cycle,
      confidence: request.confidence,
      decision: actFit.decision,
      decisionTrace: actFit.decisionTrace,
      fitState: actFit.fitState,
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
      request,
      workingMemory: cycle.workingMemory,
      authority: cycle.authority,
      evidence: cycle.evidence,
      facts: cycle.facts,
      explanation: cycle.explanation,
      cycle,
      confidence: request.confidence,
    };
  }

  return {
    outcome: 'NO_OP',
    message: cycle.explanation || 'Nothing actionable yet.',
    action: action.kind === 'noop' ? action : { kind: 'noop', message: 'no_op' },
    answer: null,
    deferred: null,
    clarify: null,
    request,
    workingMemory: cycle.workingMemory,
    authority: cycle.authority,
    evidence: cycle.evidence,
    facts: cycle.facts,
    explanation: cycle.explanation,
    cycle,
    confidence: request.confidence,
  };
}


/**
 * Legacy compatibility entry point.
 *
 * New product surfaces should enter through processCpuInteraction. This
 * function remains available for engine-level tests and lower-level callers;
 * it executes the deterministic core directly so the CPU does not recurse.
 */
export function processInteraction(input: InteractionInput): InteractionResult {
  return processInteractionCore(input);
}
