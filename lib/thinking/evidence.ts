// lib/thinking/evidence.ts
//
// Evidence capture interface — the bridge between the pure thinking
// engine and the persistent world. This module provides the in-memory
// evidence buffer for client-side use, and the Supabase write path
// for durable logging.
//
// The evidence buffer holds recent prediction log entries in memory
// so the engine can compare outcomes against predictions without
// hitting the database on every render. When a task completes, the
// engine logs the prediction, and the buffer keeps it available for
// the Patterns surface to query.

import type { PredictionLogEntry, Confidence } from './types';

// ── In-memory evidence buffer ─────────────────────────────────────
// A lightweight ring buffer that holds the most recent prediction
// logs. This is the "short-term memory" the engine uses to answer
// questions like "how accurate was my last suggestion for this kind
// of task?" without hitting Supabase.

const MAX_BUFFER_SIZE = 200;

let buffer: PredictionLogEntry[] = [];

export function logPrediction(entry: Omit<PredictionLogEntry, 'id' | 'logged_at'>): PredictionLogEntry {
  const full: PredictionLogEntry = {
    ...entry,
    logged_at: new Date().toISOString(),
  };
  buffer.unshift(full);
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer = buffer.slice(0, MAX_BUFFER_SIZE);
  }
  return full;
}

export function recordOutcome(
  taskText: string,
  actualMins: number
): void {
  // Find the most recent prediction for this task text that hasn't
  // been completed yet, and fill in the outcome.
  const entry = buffer.find(
    (e) => e.task_text === taskText && e.actual_mins === null
  );
  if (entry) {
    entry.actual_mins = actualMins;
    entry.completed_at = new Date().toISOString();
  }
}

export function getBuffer(): readonly PredictionLogEntry[] {
  return buffer;
}

export function clearBuffer(): void {
  buffer = [];
}

// ── Supabase write path ───────────────────────────────────────────
// Writes a prediction log entry to Supabase. Called from the task
// completion handler. This is the durable evidence store — the buffer
// is ephemeral, this is permanent.
//
// The supabase client is imported lazily to avoid pulling it into
// test environments where it isn't available.

let _supabaseClient: any = null;

function getSupabaseClient() {
  if (!_supabaseClient) {
    // Dynamic import to avoid bundling Supabase in test environments.
    // In production this resolves immediately; in tests the caller
    // should mock persistPrediction directly.
    try {
      _supabaseClient = require('@/lib/supabaseClient').supabase;
    } catch {
      return null;
    }
  }
  return _supabaseClient;
}

export async function persistPrediction(entry: Omit<PredictionLogEntry, 'id' | 'logged_at'>): Promise<PredictionLogEntry | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    // Test environment or missing config — return the entry without persisting.
    return { ...entry, id: 'test-id', logged_at: new Date().toISOString() } as PredictionLogEntry;
  }
  const full = {
    ...entry,
    logged_at: new Date().toISOString(),
  };
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

// ── Evidence queries ──────────────────────────────────────────────
// Pure functions over the buffer. These let the Patterns surface and
// the engine itself reason about recent outcomes without a database
// round-trip.

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
  averageError: number; // mean absolute error in minutes
  averageRatio: number; // mean actual/estimated ratio
  overEstimates: number; // tasks that took longer than predicted
  underEstimates: number; // tasks that took shorter than predicted
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
