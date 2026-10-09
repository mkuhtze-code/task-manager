import { afterEach, describe, expect, it } from 'vitest';
import { runCaptureDock } from '@/lib/engine/captureDock';
import {
  bindRequestToTask,
  bindTaskToWorkingMemory,
  emptyWorkingMemory,
  hydrateEngineStateRemote,
  loadActiveRequestLocal,
  loadWorkingMemoryLocal,
  pushEngineStateRemote,
  saveActiveRequestLocal,
  saveWorkingMemoryLocal,
  type EngineSupabase,
} from '@/lib/engine/persist';
import type { EngineRequest, WorkingMemorySnapshot } from '@/lib/engine/types';

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
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: storage,
  });
  return storage;
}

/** Two separate clients share only the remote row, like two app sessions. */
function makeRemoteDatabase() {
  const rows = new Map<string, Record<string, unknown>>();
  function client(): EngineSupabase {
    return {
      from(table: string) {
        return {
          upsert: async (value: Record<string, unknown>) => {
            if (table !== 'user_settings') return { error: new Error('Unexpected table') };
            const userId = String(value.user_id ?? '');
            if (!userId) return { error: new Error('Missing user_id') };
            rows.set(userId, { ...(rows.get(userId) ?? {}), ...value });
            return { error: null };
          },
          update: (_value: Record<string, unknown>) => ({
            eq: async (_column: string, _value: string) => ({ error: null }),
          }),
          insert: async () => ({ error: null }),
          select: (_columns: string) => ({
            eq: (column: string, value: string) => ({
              maybeSingle: async () => ({
                data: column === 'user_id' ? rows.get(value) ?? null : null,
                error: null,
              }),
            }),
          }),
        };
      },
    } as EngineSupabase;
  }
  return { client, inspect: (userId: string) => rows.get(userId) ?? null };
}

function dock(line: string, userId: string, priorRequest: EngineRequest | null) {
  return runCaptureDock({
    line,
    userId,
    priorRequest,
    jobs: [],
    captureJobId: null,
    captureSurfaceDate: '2026-10-09',
    remainingMinsToday: 240,
    openTaskCount: 0,
    inputType: 'text',
    meetings: [],
  });
}

describe('Phase J — remote capture-to-follow-up replay', () => {
  it('captures, binds a committed task, syncs remotely, hydrates a fresh session, and resolves “it”', async () => {
    installStorage();
    const userId = 'phase-j-replay-user';
    const remote = makeRemoteDatabase();

    const first = dock(
      'I need to call Jordan about the Smith Street flashing.',
      userId,
      null
    );
    expect(first.kind).toBe('act_create');
    if (first.kind !== 'act_create') return;

    const taskId = 'remote-persisted-task-001';
    const boundRequest = bindRequestToTask(first.overrides.engineRequest!, taskId);
    const memory: WorkingMemorySnapshot = bindTaskToWorkingMemory(
      first.overrides.workingMemory ?? emptyWorkingMemory(),
      {
        taskId,
        taskText: first.overrides.text,
        locationText: first.overrides.locationText,
        jobId: first.overrides.jobId,
        requestId: boundRequest.id,
      }
    );
    saveActiveRequestLocal(boundRequest, userId);
    saveWorkingMemoryLocal(memory, userId);

    const write = await pushEngineStateRemote(
      remote.client(),
      userId,
      memory,
      boundRequest,
      first.overrides.evidence ?? []
    );
    expect(write.stateSaved).toBe(true);
    expect(write.evidenceSaved).toBe(true);
    expect(remote.inspect(userId)).toMatchObject({
      user_id: userId,
      engine_working_memory: memory,
      engine_active_request: boundRequest,
    });

    // Clear the entire browser cache to model a fresh device/session.
    installStorage();
    const hydrated = await hydrateEngineStateRemote(remote.client(), userId);
    expect(hydrated.memory.currentFocus).toEqual({
      kind: 'task',
      id: taskId,
      label: first.overrides.text,
    });
    expect(hydrated.activeRequest?.id).toBe(boundRequest.id);
    expect(loadWorkingMemoryLocal(userId).recentTasks.some((item) => item.id === taskId)).toBe(true);
    expect(loadActiveRequestLocal(userId)?.id).toBe(boundRequest.id);

    // Follow-up uses the actual production capture path after remote hydration.
    const second = dock('Move it to Friday.', userId, hydrated.activeRequest);
    expect(second.kind).toBe('act_update');
    if (second.kind === 'act_update') {
      expect(second.overrides.updateTaskId).toBe(taskId);
    }
  });

  it('keeps separate users’ remote context isolated through independent clients', async () => {
    installStorage();
    const remote = makeRemoteDatabase();
    const userA = 'phase-j-user-a';
    const userB = 'phase-j-user-b';
    const privateMemory = {
      ...emptyWorkingMemory(),
      currentFocus: { kind: 'task' as const, id: 'private-a-task', label: 'Private A task' },
    };

    const saved = await pushEngineStateRemote(remote.client(), userA, privateMemory, null, []);
    expect(saved.stateSaved).toBe(true);

    installStorage();
    const userBHydrated = await hydrateEngineStateRemote(remote.client(), userB);
    expect(userBHydrated.memory.currentFocus.kind).toBe('none');
    expect(userBHydrated.activeRequest).toBeNull();

    const userAHydrated = await hydrateEngineStateRemote(remote.client(), userA);
    expect(userAHydrated.memory.currentFocus.id).toBe('private-a-task');
  });
});
