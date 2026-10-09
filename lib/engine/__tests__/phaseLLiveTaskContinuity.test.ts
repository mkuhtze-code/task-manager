import { afterEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runCaptureDock } from '@/lib/engine/captureDock';
import {
  bindRequestToTask,
  bindTaskToWorkingMemory,
  hydrateEngineStateRemote,
  pushEngineStateRemote,
  saveActiveRequestLocal,
  saveWorkingMemoryLocal,
  type EngineSupabase,
} from '@/lib/engine/persist';
import { emptyWorkingMemory } from '@/lib/engine/workingMemory';
import type { EngineRequest, WorkingMemorySnapshot } from '@/lib/engine/types';

const requested = process.env.PHASE_L_LIVE_TESTS === 'true';
const requiredEnv = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'PHASE_K_USER_A_EMAIL',
  'PHASE_K_USER_A_PASSWORD',
] as const;
const missingEnv = requiredEnv.filter((name) => !process.env[name]);
if (requested && missingEnv.length > 0) {
  throw new Error(`Phase L live test requested but missing environment variables: ${missingEnv.join(', ')}`);
}
const enabled = requested && missingEnv.length === 0;

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

function installStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: new MemoryStorage(),
  });
}

function makeClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
}

async function signIn(client: SupabaseClient) {
  const { data, error } = await client.auth.signInWithPassword({
    email: process.env.PHASE_K_USER_A_EMAIL!,
    password: process.env.PHASE_K_USER_A_PASSWORD!,
  });
  if (error) throw new Error(`Phase L sign-in failed: ${error.message}`);
  if (!data.user || !data.session) throw new Error('Phase L sign-in returned no authenticated session.');
  return data.user;
}

function makeRequest(id: string): EngineRequest {
  return {
    id,
    action: 'create_task',
    objectText: 'Call Jordan about Smith Street',
    locationText: null,
    relatedJobText: null,
    relatedMeetingText: null,
    dateHint: null,
    timeHint: null,
    urgency: 'none',
    flexibility: 'medium',
    commitment: 'weak',
    consequence: null,
    constraints: [],
    rawUtterances: ['I need to call Jordan about the Smith Street flashing.'],
    titleText: 'Call Jordan about Smith Street',
    confidence: 'high',
    updatedAt: new Date().toISOString(),
  };
}

function dock(line: string, userId: string, priorRequest: EngineRequest | null) {
  return runCaptureDock({
    line,
    userId,
    priorRequest,
    jobs: [],
    captureJobId: null,
    captureSurfaceDate: new Date().toISOString().slice(0, 10),
    remainingMinsToday: 240,
    openTaskCount: 0,
    inputType: 'text',
    meetings: [],
  });
}

describe.skipIf(!enabled)('Phase L — live task persistence and context continuity', () => {
  it('binds a real task row ID, restores context in a fresh session, updates that same row, and cleans up', async () => {
    // Dedicated test account only. The test creates one temporary task and
    // temporarily replaces two context JSONB fields, restoring/deleting both
    // in finally. No service-role key is used.
    const client = makeClient();
    const user = await signIn(client);
    let createdTaskId: string | null = null;
    let originalRow: Record<string, unknown> | null = null;

    const { data: snapshot, error: snapshotError } = await client
      .from('user_settings')
      .select('user_id, engine_working_memory, engine_active_request')
      .eq('user_id', user.id)
      .maybeSingle();

    if (snapshotError) throw new Error(`Cannot snapshot Phase L test row: ${snapshotError.message}`);
    if (!snapshot) {
      await client.auth.signOut();
      throw new Error(
        'Phase L requires an existing user_settings row. Sign in to Dokkit once with the dedicated test account before running.'
      );
    }
    originalRow = snapshot as Record<string, unknown>;

    try {
      installStorage();

      const first = dock(
        'I need to call Jordan about the Smith Street flashing.',
        user.id,
        null
      );
      expect(first.kind).toBe('act_create');
      if (first.kind !== 'act_create') return;

      // Commit a real row through the authenticated Supabase Data API. The ID
      // used below is returned by Postgres, not a synthetic test identifier.
      const { data: inserted, error: insertError } = await client
        .from('tasks')
        .insert({
          user_id: user.id,
          text: first.overrides.text,
          status: 'pending',
          source: 'planned',
          estimate_mins: first.overrides.estimateMins ?? 15,
          location_text: first.overrides.locationText ?? null,
          job_id: first.overrides.jobId ?? null,
          surface_date: first.overrides.surfaceDate ?? null,
          original_input: first.overrides.originalInput ?? 'I need to call Jordan about the Smith Street flashing.',
        })
        .select('id, user_id, text, surface_date')
        .single();

      if (insertError) throw new Error(`Phase L real task insert failed: ${insertError.message}`);
      if (!inserted?.id || inserted.user_id !== user.id) {
        throw new Error('Phase L task insert did not return the new row ID and expected owner.');
      }
      createdTaskId = String(inserted.id);

      const boundRequest = bindRequestToTask(first.overrides.engineRequest!, createdTaskId);
      const memory: WorkingMemorySnapshot = bindTaskToWorkingMemory(
        first.overrides.workingMemory ?? emptyWorkingMemory(),
        {
          taskId: createdTaskId,
          taskText: String(inserted.text),
          locationText: first.overrides.locationText,
          jobId: first.overrides.jobId,
          requestId: boundRequest.id,
        }
      );
      saveActiveRequestLocal(boundRequest, user.id);
      saveWorkingMemoryLocal(memory, user.id);

      const saved = await pushEngineStateRemote(
        client as unknown as EngineSupabase,
        user.id,
        memory,
        boundRequest,
        first.overrides.evidence ?? []
      );
      expect(saved.stateSaved).toBe(true);
      expect(saved.evidenceSaved).toBe(true);

      // Clear local state: the following turn must recover the real row ID
      // from remote context rather than from the same in-memory/local cache.
      installStorage();
      const hydrated = await hydrateEngineStateRemote(client as unknown as EngineSupabase, user.id);
      expect(hydrated.memory.currentFocus.id).toBe(createdTaskId);
      expect(hydrated.activeRequest?.id).toBe(boundRequest.id);

      const followUp = dock('Move it to Friday.', user.id, hydrated.activeRequest);
      expect(followUp.kind).toBe('act_update');
      if (followUp.kind !== 'act_update') return;
      expect(followUp.overrides.updateTaskId).toBe(createdTaskId);
      expect(followUp.overrides.surfaceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Apply the production action's intended schedule change to the actual
      // database row, scoped by both ID and owner, then verify the same row.
      const { error: updateError } = await client
        .from('tasks')
        .update({ surface_date: followUp.overrides.surfaceDate })
        .eq('id', createdTaskId)
        .eq('user_id', user.id);
      if (updateError) throw new Error(`Phase L task update failed: ${updateError.message}`);

      const { data: updated, error: verifyError } = await client
        .from('tasks')
        .select('id, user_id, text, surface_date')
        .eq('id', createdTaskId)
        .eq('user_id', user.id)
        .single();
      if (verifyError) throw new Error(`Phase L task update verification failed: ${verifyError.message}`);
      expect(updated.id).toBe(createdTaskId);
      expect(updated.user_id).toBe(user.id);
      expect(updated.text).toBe(inserted.text);
      expect(updated.surface_date).toBe(followUp.overrides.surfaceDate);
    } finally {
      // Cleanup is part of the test contract; failure must be visible.
      if (createdTaskId) {
        const { error: deleteError } = await client
          .from('tasks')
          .delete()
          .eq('id', createdTaskId)
          .eq('user_id', user.id);
        if (deleteError) {
          throw new Error(`CRITICAL: Phase L could not delete temporary task ${createdTaskId}: ${deleteError.message}`);
        }
      }

      if (originalRow) {
        const { error: restoreError } = await client
          .from('user_settings')
          .update({
            engine_working_memory: originalRow.engine_working_memory,
            engine_active_request: originalRow.engine_active_request,
          })
          .eq('user_id', user.id);
        if (restoreError) {
          throw new Error(`CRITICAL: Phase L could not restore original engine context: ${restoreError.message}`);
        }
      }
      await client.auth.signOut();
    }
  });
});
