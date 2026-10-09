import { afterEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runCaptureDock } from '@/lib/engine/captureDock';
import {
  bindRequestToTask,
  bindTaskToWorkingMemory,
  hydrateEngineStateRemote,
  pushEngineStateRemote,
  type EngineSupabase,
} from '@/lib/engine/persist';
import { emptyWorkingMemory, setFocus } from '@/lib/engine/workingMemory';
import type { EngineRequest, WorkingMemorySnapshot } from '@/lib/engine/types';

const enabled =
  process.env.PHASE_K_LIVE_TESTS === 'true' &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
  Boolean(process.env.PHASE_K_USER_A_EMAIL) &&
  Boolean(process.env.PHASE_K_USER_A_PASSWORD) &&
  Boolean(process.env.PHASE_K_USER_B_EMAIL) &&
  Boolean(process.env.PHASE_K_USER_B_PASSWORD);

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

async function signIn(client: SupabaseClient, email: string, password: string) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Phase K sign-in failed: ${error.message}`);
  if (!data.user || !data.session) throw new Error('Phase K sign-in returned no authenticated session.');
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

describe.skipIf(!enabled)('Phase K — live authenticated Supabase context', () => {
  it('round-trips context over authenticated REST, enforces account isolation, and restores the test account', async () => {
    // Use dedicated, active test accounts only. This test temporarily replaces
    // two JSONB fields on user A's settings row and restores them in finally.
    const clientA = makeClient();
    const clientB = makeClient();
    const userA = await signIn(
      clientA,
      process.env.PHASE_K_USER_A_EMAIL!,
      process.env.PHASE_K_USER_A_PASSWORD!
    );
    const userB = await signIn(
      clientB,
      process.env.PHASE_K_USER_B_EMAIL!,
      process.env.PHASE_K_USER_B_PASSWORD!
    );

    expect(userA.id).not.toBe(userB.id);

    const { data: originalRow, error: snapshotError } = await clientA
      .from('user_settings')
      .select('user_id, engine_working_memory, engine_active_request')
      .eq('user_id', userA.id)
      .maybeSingle();

    if (snapshotError) throw new Error(`Cannot snapshot Phase K test row: ${snapshotError.message}`);
    if (!originalRow) {
      throw new Error(
        'Phase K requires an existing user_settings row for test user A. Sign in to the app once with this dedicated test account before running.'
      );
    }

    const taskId = 'phase-k-live-task-' + crypto.randomUUID();
    const request = bindRequestToTask(makeRequest('phase-k-live-request-' + crypto.randomUUID()), taskId);
    const memory: WorkingMemorySnapshot = bindTaskToWorkingMemory(emptyWorkingMemory(), {
      taskId,
      taskText: 'Call Jordan about the Smith Street flashing.',
      requestId: request.id,
    });

    try {
      const saved = await pushEngineStateRemote(
        clientA as unknown as EngineSupabase,
        userA.id,
        memory,
        request,
        []
      );
      expect(saved.stateSaved).toBe(true);

      const { data: ownRow, error: ownReadError } = await clientA
        .from('user_settings')
        .select('user_id, engine_working_memory, engine_active_request')
        .eq('user_id', userA.id)
        .maybeSingle();
      expect(ownReadError).toBeNull();
      expect(ownRow?.engine_working_memory).toEqual(memory);
      expect(ownRow?.engine_active_request).toEqual(request);

      // User B must not be able to read A's context through the real Data API.
      const { data: crossRead, error: crossReadError } = await clientB
        .from('user_settings')
        .select('user_id, engine_working_memory, engine_active_request')
        .eq('user_id', userA.id)
        .maybeSingle();
      expect(crossReadError).toBeNull();
      expect(crossRead).toBeNull();

      // Exercise the app's actual upsert helper with B's JWT but A's user id.
      const maliciousMemory = setFocus(emptyWorkingMemory(), {
        kind: 'task',
        id: 'phase-k-cross-account-write',
        label: 'Must never overwrite user A context',
      });
      const crossWrite = await pushEngineStateRemote(
        clientB as unknown as EngineSupabase,
        userA.id,
        maliciousMemory,
        null,
        []
      );
      expect(crossWrite.stateSaved).toBe(false);

      // A fresh local cache must hydrate from the actual remote row, then the
      // production capture path must resolve the follow-up to the persisted ID.
      installStorage();
      const hydrated = await hydrateEngineStateRemote(
        clientA as unknown as EngineSupabase,
        userA.id
      );
      expect(hydrated.memory.currentFocus.id).toBe(taskId);
      expect(hydrated.activeRequest?.id).toBe(request.id);

      const followUp = dock('Move it to Friday.', userA.id, hydrated.activeRequest);
      expect(followUp.kind).toBe('act_update');
      if (followUp.kind === 'act_update') {
        expect(followUp.overrides.updateTaskId).toBe(taskId);
      }
    } finally {
      // Never leave the dedicated account's previous context replaced.
      const { error: restoreError } = await clientA
        .from('user_settings')
        .update({
          engine_working_memory: originalRow.engine_working_memory,
          engine_active_request: originalRow.engine_active_request,
        })
        .eq('user_id', userA.id);
      if (restoreError) {
        throw new Error(
          `CRITICAL: Phase K could not restore test user's original engine context: ${restoreError.message}`
        );
      }
      await clientA.auth.signOut();
      await clientB.auth.signOut();
    }
  });
});
