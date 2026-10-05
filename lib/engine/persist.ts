/**
 * Engine persistence — local cache + optional Supabase sync.
 * Prefer syncing evidence events; working memory is a short-term snapshot.
 */

import type { EngineRequest, LearningEvidence, WorkingMemorySnapshot } from './types';
import { emptyWorkingMemory } from './workingMemory';

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
    const raw =
      readJsonKey(WM_KEY + userSuffix(userId)) ||
      (userId ? readJsonKey(WM_KEY) : null);
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
    localStorage.setItem(WM_KEY, payload);
  } catch {
    /* quota */
  }
}

export function loadActiveRequestLocal(userId?: string | null): EngineRequest | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw =
      readJsonKey(REQ_KEY + userSuffix(userId)) ||
      (userId ? readJsonKey(REQ_KEY) : null);
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
      if (userId) localStorage.removeItem(REQ_KEY);
      return;
    }
    const payload = JSON.stringify(req);
    localStorage.setItem(key, payload);
    localStorage.setItem(REQ_KEY, payload);
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
): Promise<void> {
  try {
    await supabase
      .from('user_settings')
      .update({
        engine_working_memory: mem,
        engine_active_request: activeRequest,
      })
      .eq('user_id', userId);
  } catch {
    /* column may not exist until migration applied */
  }

  if (evidence.length === 0) return;
  try {
    const rows = evidence.map((e) => ({
      id: e.id,
      user_id: userId,
      kind: e.kind,
      request_id: e.requestId,
      payload: e.payload,
      created_at: e.timestamp,
    }));
    await supabase.from('engine_evidence_events').insert(rows);
  } catch {
    /* table may not exist yet — local cache still holds events */
  }
}

export async function hydrateEngineStateRemote(
  supabase: EngineSupabase,
  userId: string
): Promise<{ memory: WorkingMemorySnapshot; activeRequest: EngineRequest | null }> {
  try {
    const { data } = await supabase
      .from('user_settings')
      .select('engine_working_memory, engine_active_request')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) {
      return { memory: loadWorkingMemoryLocal(userId), activeRequest: loadActiveRequestLocal(userId) };
    }
    const mem =
      data.engine_working_memory && typeof data.engine_working_memory === 'object'
        ? (data.engine_working_memory as WorkingMemorySnapshot)
        : loadWorkingMemoryLocal(userId);
    const req =
      data.engine_active_request && typeof data.engine_active_request === 'object'
        ? (data.engine_active_request as EngineRequest)
        : loadActiveRequestLocal(userId);
    if (mem?.version === 1) saveWorkingMemoryLocal(mem, userId);
    if (req) saveActiveRequestLocal(req, userId);
    return { memory: mem?.version === 1 ? mem : emptyWorkingMemory(), activeRequest: req };
  } catch {
    return { memory: loadWorkingMemoryLocal(userId), activeRequest: loadActiveRequestLocal(userId) };
  }
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
