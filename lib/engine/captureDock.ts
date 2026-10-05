/**
 * Capture dock helper — maps processInteraction outcomes to dock behaviour.
 * Keeps CaptureSheet thin: it is a consumer of the interaction contract.
 */

import { processInteraction } from './interaction';
import { loadWorkingMemoryLocal, loadActiveRequestLocal } from './persist';
import type {
  EngineRequest,
  LearningEvidence,
  WorkingMemorySnapshot,
} from './types';

export type CaptureDockJob = {
  id: string;
  name: string;
  locationText?: string | null;
};

export type CaptureDockOverrides = {
  text: string;
  locationText?: string | null;
  jobId?: string | null;
  surfaceDate?: string | null;
  estimateMins?: number;
  originalInput?: string;
  explanation?: string;
  updateTaskId?: string;
  engineRequest?: EngineRequest;
  evidence?: LearningEvidence[];
  workingMemory?: WorkingMemorySnapshot;
};

export type CaptureDockResult =
  | {
      kind: 'act_create' | 'act_update';
      overrides: CaptureDockOverrides;
      request: EngineRequest;
      message: string;
    }
  | {
      kind: 'answer' | 'defer' | 'clarify';
      message: string;
      request: EngineRequest;
      clearLine?: boolean;
    }
  | {
      kind: 'fallthrough';
      message?: string;
      request: EngineRequest | null;
    };

export type CaptureDockInput = {
  line: string;
  userId: string | null;
  priorRequest: EngineRequest | null;
  jobs: CaptureDockJob[];
  captureJobId: string | null;
  captureSurfaceDate: string;
  remainingMinsToday: number | null;
  openTaskCount: number;
  inputType?: 'text' | 'speech_transcript';
  /** Optional calendar / travel context for ANSWER feasibility. */
  meetings?: Array<{ id: string; text: string; startAt?: string | null }>;
  travelMins?: number | null;
  visitDurationMins?: number | null;
};

/**
 * Run one interaction cycle for Capture dock.
 * Caller applies mutations via addTaskWithOverrides / shows feedback.
 */
export function runCaptureDock(input: CaptureDockInput): CaptureDockResult {
  const today =
    input.captureSurfaceDate && /^\d{4}-\d{2}-\d{2}$/.test(input.captureSurfaceDate)
      ? input.captureSurfaceDate
      : new Date().toISOString().slice(0, 10);

  const focusJob =
    input.captureJobId != null
      ? input.jobs.find((j) => j.id === input.captureJobId) ?? null
      : null;

  const result = processInteraction({
    userId: input.userId,
    input: {
      type: input.inputType ?? 'text',
      text: input.line,
    },
    priorRequest: input.priorRequest,
    workingMemory: loadWorkingMemoryLocal(input.userId),
    context: {
      interface: 'capture',
      surface: input.captureSurfaceDate || null,
      todayDate: today,
      remainingMinsToday: input.remainingMinsToday,
      openTaskCount: input.openTaskCount,
      jobs: input.jobs.map((j) => ({
        id: j.id,
        name: j.name,
        locationText: j.locationText ?? null,
      })),
      meetings: input.meetings,
      travelMins: input.travelMins ?? null,
      visitDurationMins: input.visitDurationMins ?? null,
      currentFocus: focusJob
        ? { kind: 'job', id: focusJob.id, label: focusJob.name }
        : null,
    },
  });

  if (result.outcome === 'ACT' && result.action) {
    const action = result.action;
    if (action.kind === 'update_task') {
      return {
        kind: 'act_update',
        request: result.request,
        message: result.explanation || result.message,
        overrides: {
          text: action.text,
          locationText: action.locationText,
          jobId: action.jobId ?? input.captureJobId,
          surfaceDate: action.surfaceDate,
          estimateMins: action.estimateMins || undefined,
          originalInput: input.line,
          explanation: result.explanation,
          updateTaskId: action.taskId,
          engineRequest: result.request,
          evidence: result.evidence,
          workingMemory: result.workingMemory,
        },
      };
    }
    if (action.kind === 'create_task') {
      return {
        kind: 'act_create',
        request: result.request,
        message: result.explanation || result.message,
        overrides: {
          text: action.text,
          locationText: action.locationText,
          jobId: action.jobId ?? input.captureJobId,
          surfaceDate: action.surfaceDate,
          estimateMins: action.estimateMins || undefined,
          originalInput: input.line,
          explanation: result.explanation,
          engineRequest: result.request,
          evidence: result.evidence,
          workingMemory: result.workingMemory,
        },
      };
    }
  }

  if (result.outcome === 'ANSWER' && result.answer) {
    return {
      kind: 'answer',
      message: result.answer.text,
      request: result.request,
    };
  }

  if (result.outcome === 'DEFER') {
    return {
      kind: 'defer',
      message: result.message,
      request: result.request,
      clearLine: true,
    };
  }

  if (result.outcome === 'CLARIFY') {
    return {
      kind: 'clarify',
      message:
        result.clarify?.question || result.message || 'Need a bit more detail.',
      request: result.request,
    };
  }

  return {
    kind: 'fallthrough',
    message: result.message || undefined,
    request: result.request,
  };
}

export function loadPriorForDock(userId: string | null): EngineRequest | null {
  return loadActiveRequestLocal(userId);
}
