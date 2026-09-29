// lib/thinking/evidence.ts
//
// Evidence capture interface — bridge between pure thinking engine and
// the persistent world. In-memory buffer + Supabase write path.
//
// Phase 2: primary identity is task_id (and prediction id).
// task_text is context / legacy fallback only.

import type { PredictionLogEntry, Confidence } from './types';
import {
  assertResolveIdentity,
  DEFAULT_RESOLVE_POLICY,
} from './v3/predictionLifecycle';

const MAX_BUFFER_SIZE = 200;

let buffer: PredictionLogEntry[] = [];

export function logPrediction(
  entry: Omit<PredictionLogEntry, 'id' | 'logged_at'> &
    Partial<Pick<PredictionLogEntry, 'id' | 'logged_at'>>
): PredictionLogEntry {
  const full: PredictionLogEntry = {
    task_id: entry.task_id ?? null,
    model_version: entry.model_version ?? null,
    algorithm_version: entry.algorithm_version ?? null,
    feature_version: entry.feature_version ?? null,
    outcome_kind: entry.outcome_kind ?? null,
    decision_id: entry.decision_id ?? null,
    ...entry,
    logged_at: entry.logged_at ?? new Date().toISOString(),
  };
  buffer.unshift(full);
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer = buffer.slice(0, MAX_BUFFER_SIZE);
  }
  return full;
}

/**
 * Attach outcome to the most recent open prediction.
 * Prefer taskId; fall back to taskText only for legacy buffer entries.
 */
export function recordOutcome(params: {
  taskId?: string | null;
  taskText?: string | null;
  actualMins: number;
  outcomeKind?: PredictionLogEntry['outcome_kind'];
}): void {
  const { taskId, taskText, actualMins, outcomeKind } = params;
  let entry: PredictionLogEntry | undefined;

  if (taskId) {
    entry = buffer.find(
      (e) => e.task_id === taskId && e.actual_mins === null
    );
  }
  if (!entry && taskText) {
    entry = buffer.find(
      (e) => e.task_text === taskText && e.actual_mins === null
    );
  }
  if (entry) {
    entry.actual_mins = actualMins;
    entry.completed_at = new Date().toISOString();
    if (outcomeKind) entry.outcome_kind = outcomeKind;
  }
}

export function getBuffer(): readonly PredictionLogEntry[] {
  return buffer;
}

export function clearBuffer(): void {
  buffer = [];
}

// ── Supabase ──────────────────────────────────────────────────────

let _supabaseClient: any = null;

function getSupabaseClient() {
  if (!_supabaseClient) {
    try {
      _supabaseClient = require('@/lib/supabaseClient').supabase;
    } catch {
      return null;
    }
  }
  return _supabaseClient;
}

function rowFromEntry(
  entry: Omit<PredictionLogEntry, 'id' | 'logged_at'> &
    Partial<Pick<PredictionLogEntry, 'id' | 'logged_at'>>
) {
  return {
    user_id: entry.user_id,
    task_id: entry.task_id ?? null,
    task_text: entry.task_text,
    cluster_label: entry.cluster_label,
    cluster_count: entry.cluster_count,
    estimated_mins: entry.estimated_mins,
    suggested_mins: entry.suggested_mins,
    confidence: entry.confidence,
    actual_mins: entry.actual_mins,
    completed_at: entry.completed_at,
    logged_at: entry.logged_at ?? new Date().toISOString(),
    model_version: entry.model_version ?? null,
    algorithm_version: entry.algorithm_version ?? null,
    feature_version: entry.feature_version ?? null,
    outcome_kind: entry.outcome_kind ?? null,
    decision_id: entry.decision_id ?? null,
  };
}

export async function persistPrediction(
  entry: Omit<PredictionLogEntry, 'id' | 'logged_at'> &
    Partial<Pick<PredictionLogEntry, 'id' | 'logged_at'>>
): Promise<PredictionLogEntry | null> {
  const supabase = getSupabaseClient();
  const full = rowFromEntry(entry);
  if (!supabase) {
    return { ...full, id: 'test-id' } as PredictionLogEntry;
  }
  const { data, error } = await supabase
    .from('prediction_log')
    .insert(full)
    .select()
    .single();
  if (error) {
    console.error('[thinking] Failed to persist prediction:', error);
    return null;
  }
  return data as PredictionLogEntry;
}

/**
 * Close an open prediction by task_id (preferred) or legacy task_text.
 * Updates the row in place so prediction remains immutable in identity
 * while outcome attaches.
 */
export async function resolveOpenPrediction(params: {
  userId: string;
  taskId?: string | null;
  taskText?: string | null;
  actualMins: number;
  outcomeKind?: PredictionLogEntry['outcome_kind'];
  /** S4: default taskId-only. Set false only for audited legacy recovery. */
  allowTextFallback?: boolean;
}): Promise<PredictionLogEntry | null> {
  const supabase = getSupabaseClient();
  const completedAt = new Date().toISOString();
  const patch = {
    actual_mins: params.actualMins,
    completed_at: completedAt,
    outcome_kind: params.outcomeKind ?? 'done',
  };

  const policy = {
    ...DEFAULT_RESOLVE_POLICY,
    taskIdOnly: params.allowTextFallback === true ? false : true,
  };
  const identity = assertResolveIdentity(
    { taskId: params.taskId, taskText: params.taskText },
    policy
  );

  // S4: without taskId, do not resolve by text under default policy.
  if (!identity.ok && policy.taskIdOnly) {
    if (!supabase) {
      recordOutcome({
        taskId: params.taskId,
        taskText: params.taskText,
        actualMins: params.actualMins,
        outcomeKind: params.outcomeKind,
      });
    }
    return null;
  }

  if (!supabase) {
    recordOutcome({
      taskId: params.taskId,
      taskText: params.taskText,
      actualMins: params.actualMins,
      outcomeKind: params.outcomeKind,
    });
    const hit = buffer.find(
      (e) => params.taskId && e.task_id === params.taskId && e.actual_mins == null
    );
    return hit ?? null;
  }

  if (params.taskId) {
    const { data, error } = await supabase
      .from('prediction_log')
      .update(patch)
      .eq('user_id', params.userId)
      .eq('task_id', params.taskId)
      .is('actual_mins', null)
      .order('logged_at', { ascending: false })
      .limit(1)
      .select()
      .maybeSingle();
    if (error) {
      console.error('[thinking] Failed to resolve prediction by task_id:', error);
    } else if (data) {
      return data as PredictionLogEntry;
    }
  }

  // Text fallback only when explicitly allowed (legacy recovery).
  if (params.allowTextFallback === true && params.taskText) {
    const { data, error } = await supabase
      .from('prediction_log')
      .update(patch)
      .eq('user_id', params.userId)
      .eq('task_text', params.taskText)
      .is('actual_mins', null)
      .order('logged_at', { ascending: false })
      .limit(1)
      .select()
      .maybeSingle();
    if (error) {
      console.error('[thinking] Failed to resolve prediction by text:', error);
      return null;
    }
    return (data as PredictionLogEntry) ?? null;
  }

  return null;
}

/**
 * S4: expire open predictions older than horizon (default 14 days).
 * Sets completed_at; leaves actual_mins null — no duration train.
 */
export async function expireStaleOpenPredictions(params: {
  userId: string;
  asOf?: string;
  horizonDays?: number;
}): Promise<number> {
  const supabase = getSupabaseClient();
  const asOf = params.asOf ?? new Date().toISOString();
  const horizon = params.horizonDays ?? 14;
  const cutoff = new Date(asOf);
  cutoff.setUTCDate(cutoff.getUTCDate() - horizon);
  const cutoffIso = cutoff.toISOString();

  if (!supabase) {
    let n = 0;
    for (const e of buffer) {
      if (
        e.user_id === params.userId &&
        e.actual_mins == null &&
        !e.completed_at &&
        e.logged_at &&
        e.logged_at < cutoffIso
      ) {
        (e as PredictionLogEntry).completed_at = asOf;
        n++;
      }
    }
    return n;
  }

  const { data, error } = await supabase
    .from('prediction_log')
    .update({ completed_at: asOf })
    .eq('user_id', params.userId)
    .is('actual_mins', null)
    .is('completed_at', null)
    .lt('logged_at', cutoffIso)
    .select('id');

  if (error) {
    console.error('[thinking] Failed to expire open predictions:', error);
    return 0;
  }
  return data?.length ?? 0;
}

export function recentOutcomes(
  buffer: readonly PredictionLogEntry[],
  limit: number = 20
): PredictionLogEntry[] {
  return buffer
    .filter((e) => e.actual_mins !== null)
    .slice(0, limit);
}

export function accuracySummary(
  buffer: readonly PredictionLogEntry[]
): {
  totalPredictions: number;
  completedPredictions: number;
  averageError: number;
  averageRatio: number;
  overEstimates: number;
  underEstimates: number;
} {
  const completed = buffer.filter((e) => e.actual_mins !== null);
  if (completed.length === 0) {
    return {
      totalPredictions: buffer.length,
      completedPredictions: 0,
      averageError: 0,
      averageRatio: 1,
      overEstimates: 0,
      underEstimates: 0,
    };
  }

  let totalError = 0;
  let totalRatio = 0;
  let over = 0;
  let under = 0;

  for (const entry of completed) {
    const error = Math.abs(entry.actual_mins! - entry.estimated_mins);
    totalError += error;
    totalRatio += entry.actual_mins! / Math.max(entry.estimated_mins, 1);
    if (entry.actual_mins! > entry.estimated_mins) over++;
    else under++;
  }

  return {
    totalPredictions: buffer.length,
    completedPredictions: completed.length,
    averageError: Math.round(totalError / completed.length),
    averageRatio: totalRatio / completed.length,
    overEstimates: over,
    underEstimates: under,
  };
}
