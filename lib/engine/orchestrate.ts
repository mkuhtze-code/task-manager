/**
 * Thin orchestration — connects engines for one reasoning cycle.
 * Does not mutate app state; returns a proposal the surface may apply.
 */

import type {
  EngineAction,
  EngineCycleResult,
  EngineRequest,
  LearningEvidence,
  PlanProposal,
  ReasoningContext,
  WorkingMemorySnapshot,
} from './types';
import { decideAuthority } from './authority';
import { assembleContext, resolveJobName, resolveLocationAgainstJobs } from './contextAssembly';
import { explainDecision } from './explain';
import { containsReference, resolveReference } from './references';
import { applyUtteranceToRequest, requestTaskText } from './request';
import { interpretSemanticInput } from './semanticInterpreter';
import {
  emptyWorkingMemory,
  makeMemoryItem,
  remember,
  setActiveRequest,
  setFocus,
  setTopic,
  touchDecay,
} from './workingMemory';

export type CycleInput = {
  utterance: string;
  context?: Parameters<typeof assembleContext>[0];
  /** Prior request when refining the same slice */
  priorRequest?: EngineRequest | null;
  workingMemory?: WorkingMemorySnapshot;
  /** ISO date YYYY-MM-DD for "today" placement */
  todayDate?: string;
};

function evidence(
  kind: LearningEvidence['kind'],
  requestId: string | null,
  payload: Record<string, unknown>
): LearningEvidence {
  return {
    id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    timestamp: new Date().toISOString(),
    requestId,
    payload,
  };
}

function planForRequest(
  req: EngineRequest,
  ctx: ReasoningContext,
  todayDate: string | undefined,
  facts: string[]
): PlanProposal {
  const steps: PlanProposal['steps'] = [];
  const conf = req.confidence;

  const taskText = requestTaskText(req);
  steps.push({ kind: 'create_task', text: taskText, reason: 'request_object' });

  if (req.locationText) {
    const locJob = resolveLocationAgainstJobs(req.locationText, ctx.jobs);
    if (locJob) {
      steps.push({
        kind: 'attach_job',
        jobId: locJob.id,
        jobName: locJob.name,
        reason: `location_matched_${locJob.matchedField}`,
      });
      facts.push(`Matched place to job: ${locJob.name}.`);
    } else {
      steps.push({
        kind: 'attach_location',
        locationText: req.locationText,
        reason: 'location_text',
      });
      facts.push(`Location noted: ${req.locationText}.`);
    }
  }

  if (req.relatedJobText) {
    const job = resolveJobName(req.relatedJobText, ctx.jobs);
    if (job) {
      steps.push({
        kind: 'attach_job',
        jobId: job.id,
        jobName: job.name,
        reason: 'related_job',
      });
      facts.push(`Linked to job: ${job.name}.`);
    } else {
      facts.push(`Job mentioned (${req.relatedJobText}) not uniquely matched.`);
    }
  }

  const wantsToday = req.dateHint === 'today';
  const routeOpp = req.constraints.some((c) => c.value === 'route_opportunity');
  const afterMeeting = req.constraints.some((c) => c.value === 'after_meeting');

  if (afterMeeting && ctx.meetings.length > 0) {
    facts.push(`Meeting context available (${ctx.meetings.length}).`);
  }
  if (routeOpp) {
    facts.push('Route opportunity mentioned.');
  }

  // Explicit date/time is a commitment: always place when the user named a day.
  // Capacity analysis may add an advisory suggest step — it must not replace place.
  if (wantsToday && todayDate) {
    steps.push({
      kind: 'place',
      surfaceDate: todayDate,
      reason: 'user_said_today',
    });
    facts.push('Placed for today per your constraint.');

    // Capacity is advisory only. Feasibility is evaluated through the
    // shared V3 fit path attached to the interaction result. Do not create
    // a competing plan-level capacity warning here; doing so makes ACT and
    // ANSWER tell different stories.
  } else if (req.dateHint === 'tomorrow') {
    steps.push({
      kind: 'place',
      surfaceDate: null,
      reason: 'tomorrow_hint',
    });
    facts.push('Targeted for tomorrow.');
  } else if (req.dateHint && req.dateHint !== 'today') {
    steps.push({
      kind: 'place',
      surfaceDate: null,
      reason: `date_hint_${req.dateHint}`,
    });
    facts.push(`Targeted for ${req.dateHint}.`);
  } else if (req.timeHint) {
    steps.push({
      kind: 'place',
      surfaceDate: todayDate ?? null,
      reason: 'user_said_time',
    });
    facts.push(`Time noted: ${req.timeHint}.`);
  } else {
    steps.push({
      kind: 'suggest',
      message: 'No hard day set — dock when it suits, or say today/tomorrow.',
      reason: 'flexible',
    });
  }

  if (routeOpp && afterMeeting) {
    steps.push({
      kind: 'suggest',
      message: 'Consider placing this after your meeting while you are in the area.',
      reason: 'route_after_meeting',
    });
  }

  const summary = steps
    .filter((s) => s.kind === 'suggest' || s.kind === 'place' || s.kind === 'create_task')
    .map((s) => {
      if (s.kind === 'create_task') return `Task: ${s.text}`;
      if (s.kind === 'place') return s.surfaceDate ? `On ${s.surfaceDate}` : 'Day flexible';
      if (s.kind === 'suggest') return s.message;
      return '';
    })
    .filter(Boolean)
    .join(' · ');

  return { steps, summary, confidence: conf, facts: [...facts] };
}

function explicitDurationMins(req: EngineRequest): number | null {
  const duration = [...req.constraints]
    .reverse()
    .find((c) => c.axis === 'duration' && c.value.startsWith('minutes:'));
  if (!duration) return null;
  const mins = Number(duration.value.slice('minutes:'.length));
  return Number.isFinite(mins) && mins > 0 ? mins : null;
}

function taskIdFromConstraints(req: EngineRequest): string | null {
  const c = req.constraints.find(
    (x) => x.axis === 'dependency' && x.value.startsWith('task:')
  );
  return c ? c.value.slice(5) : null;
}

function actionFromPlan(
  req: EngineRequest,
  plan: PlanProposal,
  mayAct: boolean,
  _ctx: ReasoningContext,
  currentUtterance: string
): EngineAction {
  if (!mayAct) {
    const ask = plan.steps.find((s) => s.kind === 'ask');
    if (ask && ask.kind === 'ask') return { kind: 'ask', message: ask.message };
    const sug = plan.steps.find((s) => s.kind === 'suggest');
    if (sug && sug.kind === 'suggest') return { kind: 'suggest', message: sug.message };
    return { kind: 'ask', message: 'Need a bit more detail before acting.' };
  }

  const create = plan.steps.find((s) => s.kind === 'create_task');
  const place = plan.steps.find((s) => s.kind === 'place');
  const jobStep = [...plan.steps].reverse().find((s) => s.kind === 'attach_job');
  const locStep = plan.steps.find((s) => s.kind === 'attach_location');

  const text =
    create && create.kind === 'create_task' ? create.text : requestTaskText(req);

  const locationText =
    locStep && locStep.kind === 'attach_location'
      ? locStep.locationText
      : req.locationText;
  const jobId = jobStep && jobStep.kind === 'attach_job' ? jobStep.jobId : null;
  const surfaceDate = place && place.kind === 'place' ? place.surfaceDate : null;

  // A task binding belongs to a refinement chain, not to every future
  // utterance. Once the user starts a new explicit request, the old bound
  // task must stop being executable context.
  const boundTaskId = taskIdFromConstraints(req);
  const isRefinement =
    req.rawUtterances.length > 1 &&
    /^(?:actually|sorry|no[, ]|i\s+need\s+it|make\s+that|put\s+that|move\s+(?:it|that)|change\s+(?:it|that)|update\s+(?:it|that)|add\s+(?:that|this)|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|today)\b/i.test(
      currentUtterance.trim()
    );
  if (boundTaskId && isRefinement) {
    return {
      kind: 'update_task',
      taskId: boundTaskId,
      text,
      locationText,
      jobId,
      surfaceDate,
      estimateMins: null,
    };
  }

  const focus = _ctx.workingMemory?.currentFocus;
  if (isRefinement && focus?.kind === 'task' && focus.id && req.rawUtterances.length > 1) {
    return {
      kind: 'update_task',
      taskId: focus.id,
      text,
      locationText,
      jobId,
      surfaceDate,
      estimateMins: null,
    };
  }

  return {
    kind: 'create_task',
    text,
    locationText,
    jobId,
    surfaceDate,
    // Explicit duration wins; 15m remains the legacy fallback.
    estimateMins: explicitDurationMins(req) ?? 15,
  };
}

/**
 * One complete engine cycle for an utterance.
 */
export function runEngineCycle(input: CycleInput): EngineCycleResult {
  const facts: string[] = [];
  const evidenceList: LearningEvidence[] = [];

  let mem = touchDecay(input.workingMemory ?? emptyWorkingMemory());
  mem = remember(
    mem,
    makeMemoryItem({
      type: 'utterance',
      label: input.utterance.trim(),
      source: 'user',
      salience: 0.9,
      confidence: 'high',
    })
  );

  const semantic = interpretSemanticInput(input.utterance, {
    workingMemory: mem,
    currentFocus: mem.currentFocus,
    jobs: input.context?.jobs ?? [],
    meetings: input.context?.meetings ?? [],
  });

  // Reference resolution enriches the same request/memory path. Current
  // jobs/meetings are ephemeral candidates; a resolved task reference becomes
  // an explicit dependency so the action layer has a concrete target.
  let resolvedReference: ReturnType<typeof resolveReference> | null = null;
  if (containsReference(input.utterance)) {
    const context = input.context;
    const contextReferents = [
      ...(context?.jobs ?? []).map((job) => ({
        id: job.id,
        type: 'job' as const,
        label: job.name,
        source: 'current_context',
        timestamp: new Date().toISOString(),
        salience: 0.55,
        confidence: 'medium' as const,
        relationships: {},
      })),
      ...(context?.meetings ?? []).map((meeting) => ({
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
    resolvedReference = resolveReference(input.utterance, mem, {
      extraReferents: contextReferents,
    });
    evidenceList.push(
      evidence('reference_resolved', null, {
        status: resolvedReference.status,
        reason: resolvedReference.reason,
      })
    );
    if (resolvedReference.status === 'resolved') {
      facts.push(`Resolved “${resolvedReference.item.label}” (${resolvedReference.reason}).`);
      mem = remember(mem, {
        ...resolvedReference.item,
        salience: Math.min(1, resolvedReference.item.salience + 0.1),
      });
    }
  }

  let request = applyUtteranceToRequest(
    input.priorRequest ?? null,
    input.utterance,
    mem
  );

  if (resolvedReference?.status === 'resolved') {
    if (resolvedReference.item.type === 'task') {
      const alreadyBound = request.constraints.some(
        (c) => c.axis === 'dependency' && c.value === `task:${resolvedReference!.item.id}`
      );
      if (!alreadyBound) {
        request = {
          ...request,
          constraints: [
            ...request.constraints,
            {
              axis: 'dependency',
              value: `task:${resolvedReference.item.id}`,
              confidence: 'high',
              source: 'context_reference',
            },
          ],
        };
      }
    } else if (
      resolvedReference.item.type === 'location' &&
      !request.locationText
    ) {
      request = {
        ...request,
        locationText: resolvedReference.item.label,
        constraints: [
          ...request.constraints,
          {
            axis: 'location',
            value: resolvedReference.item.label,
            confidence: 'high',
            source: 'context_reference',
          },
        ],
      };
      facts.push(`Inherited location: ${resolvedReference.item.label}.`);
    }
  }

  mem = setActiveRequest(mem, request.id);
  // Prefer task focus when this request is already bound to a docked task.
  const boundId = taskIdFromConstraints(request);
  if (boundId) {
    mem = setFocus(mem, {
      kind: 'task',
      id: boundId,
      label: request.objectText || requestTaskText(request),
    });
  }
  if (request.objectText) {
    mem = setTopic(mem, request.objectText);
    if (!boundId) {
      mem = setFocus(mem, {
        kind: 'request',
        id: request.id,
        label: request.objectText,
      });
    }
    mem = remember(
      mem,
      makeMemoryItem({
        type: 'entity',
        label: request.objectText,
        source: 'request',
        salience: 0.85,
        relationships: { requestId: request.id },
      })
    );
  }
  if (request.locationText) {
    mem = remember(
      mem,
      makeMemoryItem({
        type: 'location',
        label: request.locationText,
        source: 'request',
        salience: 0.8,
        relationships: { requestId: request.id },
      })
    );
  }
  if (request.relatedJobText) {
    mem = remember(
      mem,
      makeMemoryItem({
        type: 'job',
        label: request.relatedJobText,
        source: 'request',
        salience: 0.8,
        relationships: { requestId: request.id },
      })
    );
  }

  const ctx = assembleContext({
    ...input.context,
    workingMemory: mem,
  });

  const plan = planForRequest(request, ctx, input.todayDate, facts);
  const authority = decideAuthority(request);
  const action = actionFromPlan(request, plan, authority.mayAct, ctx, input.utterance);
  const explanation = explainDecision({
    request,
    plan,
    authority,
    facts: plan.facts,
  });

  evidenceList.push(
    evidence('interpretation', request.id, {
      action: request.action,
      objectText: request.objectText,
      locationText: request.locationText,
      dateHint: request.dateHint,
      confidence: request.confidence,
    }),
    evidence('decision', request.id, {
      authority: authority.reason,
      planSummary: plan.summary,
      actionKind: action.kind,
    })
  );

  const meaningSummary = [
    request.action,
    request.objectText,
    request.locationText ? `@ ${request.locationText}` : null,
    request.dateHint,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    semantic,
    meaningSummary,
    request,
    workingMemory: mem,
    plan,
    authority,
    action,
    explanation,
    evidence: evidenceList,
    facts: plan.facts,
  };
}

/** Multi-turn vertical slice helper. */
export function runConversation(
  utterances: string[],
  base: Omit<CycleInput, 'utterance' | 'priorRequest' | 'workingMemory'> = {}
): EngineCycleResult[] {
  const results: EngineCycleResult[] = [];
  let prior: EngineRequest | null = null;
  let mem: WorkingMemorySnapshot | undefined = base.context?.workingMemory;

  for (const u of utterances) {
    const r = runEngineCycle({
      ...base,
      utterance: u,
      priorRequest: prior,
      workingMemory: mem,
    });
    results.push(r);
    prior = r.request;
    mem = r.workingMemory;
  }
  return results;
}
