/**
 * Engine persistence — local cache + optional Supabase sync.
 * Prefer syncing evidence events; working memory is a short-term snapshot.
 */

import type { EngineRequest, LearningEvidence, WorkingMemorySnapshot } from './types';
import { isEngineRequest, isWorkingMemorySnapshot } from './persistValidation';
import { emptyWorkingMemory, makeMemoryItem, remember, setActiveRequest, setFocus } from './workingMemory';

const WM_KEY = 'dokkit.engine.workingMemory.v1';
const REQ_KEY = 'dokkit.engine.activeRequest.v1';
const EV_KEY = 'dokkit.engine.evidence.v1';
const MAX_LOCAL_EVIDENCE = 200;

function userSuffix(userId: string | null | undefined): string {
  return userId && userId.length > 0 ? `:${userId}` : '';
}

function readJsonKey(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function loadWorkingMemoryLocal(userId?: string | null): WorkingMemorySnapshot {
  if (typeof localStorage === 'undefined') return emptyWorkingMemory();
  try {
    // Authenticated users must never fall back to the legacy unscoped key:
    // that key may belong to a different account used in the same browser.
    const raw = readJsonKey(WM_KEY + userSuffix(userId));
    if (!raw) return emptyWorkingMemory();
    const parsed = JSON.parse(raw) as WorkingMemorySnapshot;
    if (parsed?.version !== 1) return emptyWorkingMemory();
    return parsed;
  } catch {
    return emptyWorkingMemory();
  }
}

export function saveWorkingMemoryLocal(
  mem: WorkingMemorySnapshot,
  userId?: string | null
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload = JSON.stringify(mem);
    localStorage.setItem(WM_KEY + userSuffix(userId), payload);
  } catch {
    /* quota */
  }
}

export function loadActiveRequestLocal(userId?: string | null): EngineRequest | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    // Keep active requests isolated by account for the same reason as memory.
    const raw = readJsonKey(REQ_KEY + userSuffix(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EngineRequest;
    if (!parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveActiveRequestLocal(
  req: EngineRequest | null,
  userId?: string | null
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const key = REQ_KEY + userSuffix(userId);
    if (!req) {
      localStorage.removeItem(key);
      return;
    }
    const payload = JSON.stringify(req);
    localStorage.setItem(key, payload);
  } catch {
    /* quota */
  }
}

export function appendEvidenceLocal(
  events: LearningEvidence[],
  userId?: string | null
): void {
  if (typeof localStorage === 'undefined' || events.length === 0) return;
  try {
    const key = EV_KEY + userSuffix(userId);
    const prev = JSON.parse(localStorage.getItem(key) || '[]') as LearningEvidence[];
    const next = [...events, ...prev].slice(0, MAX_LOCAL_EVIDENCE);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* quota */
  }
}

export function loadEvidenceLocal(userId?: string | null): LearningEvidence[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(EV_KEY + userSuffix(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LearningEvidence[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Minimal supabase client shape — avoids hard dependency in pure tests. */
export type EngineSupabase = {
  from: (table: string) => {
    upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => Promise<{ error: unknown }>;
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: unknown }>;
    };
    insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => Promise<{ error: unknown }>;
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
  };
};

export async function pushEngineStateRemote(
  supabase: EngineSupabase,
  userId: string,
  mem: WorkingMemorySnapshot,
  activeRequest: EngineRequest | null,
  evidence: LearningEvidence[]
): Promise<{ stateSaved: boolean; evidenceSaved: boolean }> {
  let stateSaved = false;
  let evidenceSaved = evidence.length === 0;

  try {
    // Upsert makes first-use accounts durable too; update() silently affects
    // zero rows when user_settings has not been initialized yet.
    const { error } = await supabase.from('user_settings').upsert(
      {
        user_id: userId,
        engine_working_memory: mem,
        engine_active_request: activeRequest,
      },
      { onConflict: 'user_id' }
    );
    stateSaved = !error;
  } catch {
    // Migration/configuration failures must not break capture. The caller can
    // inspect the result and the account-scoped local cache remains available.
  }

  if (evidence.length > 0) {
    try {
      const rows = evidence.map((e) => ({
        id: e.id,
        user_id: userId,
        kind: e.kind,
        request_id: e.requestId,
        payload: e.payload,
        created_at: e.timestamp,
      }));
      const { error } = await supabase.from('engine_evidence_events').insert(rows);
      evidenceSaved = !error;
    } catch {
      evidenceSaved = false;
      // Evidence sync is independent of working-memory snapshot sync.
    }
  }
  return { stateSaved, evidenceSaved };
}

export async function hydrateEngineStateRemote(
  supabase: EngineSupabase,
  userId: string
): Promise<{ memory: WorkingMemorySnapshot; activeRequest: EngineRequest | null }> {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('engine_working_memory, engine_active_request')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) {
      return { memory: loadWorkingMemoryLocal(userId), activeRequest: loadActiveRequestLocal(userId) };
    }

    // A successful remote row is authoritative, including an explicit null
    // active request. Do not resurrect a stale local request after it was
    // cleared remotely.
    // JSONB is persisted across deployments and must be validated at runtime;
    // a TypeScript cast cannot establish that a stored payload is well formed.
    // A NULL, unsupported, or malformed snapshot means remote state is not
    // authoritative yet, so preserve this account's known-good local context.
    if (!isWorkingMemorySnapshot(data.engine_working_memory)) {
      return { memory: loadWorkingMemoryLocal(userId), activeRequest: loadActiveRequestLocal(userId) };
    }
    const memory = data.engine_working_memory;
    // An explicit NULL means cleared. A malformed non-null request is not
    // trusted; retain only this same account's known-good local request.
    const remoteRequest =
      data.engine_active_request === null
        ? null
        : isEngineRequest(data.engine_active_request)
          ? data.engine_active_request
          : loadActiveRequestLocal(userId);

    saveWorkingMemoryLocal(memory, userId);
    saveActiveRequestLocal(remoteRequest, userId);
    return { memory, activeRequest: remoteRequest };
  } catch {
    return { memory: loadWorkingMemoryLocal(userId), activeRequest: loadActiveRequestLocal(userId) };
  }
}

/**
 * Bind a successfully persisted task row into short-term working memory.
 *
 * The engine cannot know the database task id before the surface commits the
 * task. Call this only after the task insert/update succeeds, so later turns
 * resolve references to the real task row rather than a transient request.
 */
export function bindTaskToWorkingMemory(
  memory: WorkingMemorySnapshot,
  input: {
    taskId: string;
    taskText: string;
    locationText?: string | null;
    jobId?: string | null;
    requestId?: string | null;
  }
): WorkingMemorySnapshot {
  const taskText = input.taskText.trim();
  if (!input.taskId.trim() || !taskText) return memory;

  const relationships: Record<string, string> = {};
  if (input.locationText?.trim()) relationships.locationText = input.locationText.trim();
  if (input.jobId?.trim()) relationships.jobId = input.jobId.trim();
  if (input.requestId?.trim()) relationships.requestId = input.requestId.trim();

  let next = remember(
    memory,
    makeMemoryItem({
      id: input.taskId,
      type: 'task',
      label: taskText,
      source: 'persisted_task',
      confidence: 'high',
      salience: 1,
      relationships,
      payload: { taskId: input.taskId },
    })
  );
  next = setFocus(next, { kind: 'task', id: input.taskId, label: taskText });
  if (input.requestId) next = setActiveRequest(next, input.requestId);
  return next;
}

/** Bind a created/updated task id onto the active request for multi-turn refine. */
export function bindRequestToTask(req: EngineRequest, taskId: string): EngineRequest {
  return {
    ...req,
    constraints: [
      ...req.constraints.filter((c) => !(c.axis === 'dependency' && c.value.startsWith('task:'))),
      {
        axis: 'dependency',
        value: `task:${taskId}`,
        confidence: 'high',
        source: 'engine_bind',
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function taskIdFromRequest(req: EngineRequest | null | undefined): string | null {
  if (!req) return null;
  const c = req.constraints.find((x) => x.axis === 'dependency' && x.value.startsWith('task:'));
  return c ? c.value.slice(5) : null;
}
