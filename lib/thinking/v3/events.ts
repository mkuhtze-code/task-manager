// lib/thinking/v3/events.ts
//
// Append-oriented event vocabulary for the thinking engine.
// Events that materially affect the model — not every UI click.
// Pure types + id helpers. Persistence is optional and additive.

export type ThinkingEventKind =
  | 'task_created'
  | 'task_edited'
  | 'estimate_set'
  | 'estimate_changed'
  | 'task_started'
  | 'task_stopped'
  | 'task_completed'
  | 'task_partial'
  | 'task_carried'
  | 'task_skipped'
  | 'task_resumed'
  | 'subtask_completed'
  | 'prediction_created'
  | 'prediction_resolved'
  | 'job_attached'
  | 'location_observed'
  | 'context_observed';

/**
 * Immutable thinking event. userId + timestamps required.
 * source distinguishes UI ambient capture from engine internal.
 */
export type ThinkingEvent = {
  eventId: string;
  kind: ThinkingEventKind;
  userId: string;
  taskId: string | null;
  predictionId: string | null;
  decisionId: string | null;
  /** Opaque payload — keep small; no free-text dumps beyond short labels. */
  payload: Record<string, unknown>;
  source: 'ui' | 'engine' | 'system';
  modelVersion: string | null;
  createdAt: string;
};

/** Deterministic-ish id for client-side events before server assign. */
export function makeEventId(prefix = 'evt'): string {
  // crypto.randomUUID when available; fallback for older test envs
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    /* fall through */
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function makeDecisionId(): string {
  return makeEventId('dec');
}

export function buildThinkingEvent(params: {
  kind: ThinkingEventKind;
  userId: string;
  taskId?: string | null;
  predictionId?: string | null;
  decisionId?: string | null;
  payload?: Record<string, unknown>;
  source?: ThinkingEvent['source'];
  modelVersion?: string | null;
  createdAt?: string;
  eventId?: string;
}): ThinkingEvent {
  return {
    eventId: params.eventId ?? makeEventId(),
    kind: params.kind,
    userId: params.userId,
    taskId: params.taskId ?? null,
    predictionId: params.predictionId ?? null,
    decisionId: params.decisionId ?? null,
    payload: params.payload ?? {},
    source: params.source ?? 'engine',
    modelVersion: params.modelVersion ?? null,
    createdAt: params.createdAt ?? new Date().toISOString(),
  };
}
