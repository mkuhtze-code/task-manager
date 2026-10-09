import { afterEach, describe, expect, it } from 'vitest';
import type { EngineRequest, WorkingMemorySnapshot } from '@/lib/engine';
import {
  emptyWorkingMemory,
  hydrateEngineStateRemote,
  loadActiveRequestLocal,
  loadWorkingMemoryLocal,
  pushEngineStateRemote,
  saveActiveRequestLocal,
  saveWorkingMemoryLocal,
  setFocus,
  type EngineSupabase,
} from '@/lib/engine';

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

function makeRequest(id = 'request-remote-1'): EngineRequest {
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
    constraints: [{ axis: 'dependency', value: 'task:task-remote-1', confidence: 'high', source: 'engine_bind' }],
    rawUtterances: ['Call Jordan about Smith Street'],
    titleText: 'Call Jordan about Smith Street',
    confidence: 'high',
    updatedAt: '2026-10-09T09:00:00.000Z',
  };
}

function makeClient(initial: Record<string, unknown> | null = null, failUpsert = false) {
  let row = initial ? { ...initial } : null;
  const client = {
    from(table: string) {
      return {
        upsert: async (value: Record<string, unknown>) => {
          if (failUpsert) return { error: new Error('remote write failed') };
          if (table === 'user_settings') row = { ...(row ?? {}), ...value };
          return { error: null };
        },
        update: (_value: Record<string, unknown>) => ({
          eq: async (_column: string, _value: string) => ({ error: null }),
        }),
        insert: async (_value: Record<string, unknown> | Record<string, unknown>[]) => ({ error: null }),
        select: (_columns: string) => ({
          eq: (column: string, value: string) => ({
            maybeSingle: async () => ({
              data: column === 'user_id' && row?.user_id === value ? row : null,
              error: null,
            }),
          }),
        }),
      };
    },
    inspect: () => row,
  };
  return client as unknown as EngineSupabase & { inspect: () => Record<string, unknown> | null };
}

describe('Phase H — remote context persistence round-trip', () => {
  it('writes a user-scoped snapshot and hydrates it into a fresh local cache', async () => {
    installStorage();
    const userId = 'phase-h-user';
    const memory: WorkingMemorySnapshot = setFocus(emptyWorkingMemory(), {
      kind: 'task',
      id: 'task-remote-1',
      label: 'Call Jordan about Smith Street',
    });
    const request = makeRequest();
    const client = makeClient();

    const write = await pushEngineStateRemote(client, userId, memory, request, []);
    expect(write).toEqual({ stateSaved: true, evidenceSaved: true });
    expect(client.inspect()).toMatchObject({
      user_id: userId,
      engine_working_memory: memory,
      engine_active_request: request,
    });

    // Simulate a new browser/device with no local context.
    installStorage();
    const hydrated = await hydrateEngineStateRemote(client, userId);
    expect(hydrated.memory.currentFocus).toEqual(memory.currentFocus);
    expect(hydrated.activeRequest?.id).toBe(request.id);
    expect(loadWorkingMemoryLocal(userId).currentFocus.id).toBe('task-remote-1');
    expect(loadActiveRequestLocal(userId)?.id).toBe(request.id);
  });

  it('treats a remotely cleared active request as authoritative over stale local data', async () => {
    installStorage();
    const userId = 'phase-h-cleared-user';
    saveActiveRequestLocal(makeRequest('stale-local-request'), userId);
    const client = makeClient({
      user_id: userId,
      engine_working_memory: emptyWorkingMemory(),
      engine_active_request: null,
    });

    const hydrated = await hydrateEngineStateRemote(client, userId);
    expect(hydrated.activeRequest).toBeNull();
    expect(loadActiveRequestLocal(userId)).toBeNull();
  });

  it('preserves account-local context when the migrated remote snapshot is still uninitialized', async () => {
    installStorage();
    const userId = 'phase-h-migration-user';
    saveActiveRequestLocal(makeRequest('existing-local-request'), userId);
    const client = makeClient({
      user_id: userId,
      engine_working_memory: null,
      engine_active_request: null,
    });

    const hydrated = await hydrateEngineStateRemote(client, userId);
    expect(hydrated.activeRequest?.id).toBe('existing-local-request');
    expect(loadActiveRequestLocal(userId)?.id).toBe('existing-local-request');
  });

  it('does not hydrate another account’s remote snapshot', async () => {
    installStorage();
    const client = makeClient({
      user_id: 'phase-h-user-a',
      engine_working_memory: setFocus(emptyWorkingMemory(), {
        kind: 'task',
        id: 'private-task-a',
        label: 'Private account A task',
      }),
      engine_active_request: makeRequest('private-request-a'),
    });

    const hydrated = await hydrateEngineStateRemote(client, 'phase-h-user-b');
    expect(hydrated.memory.currentFocus.kind).toBe('none');
    expect(hydrated.activeRequest).toBeNull();
  });

  it('reports a failed remote write instead of claiming the snapshot is durable', async () => {
    installStorage();
    const result = await pushEngineStateRemote(
      makeClient(null, true),
      'phase-h-write-failure-user',
      emptyWorkingMemory(),
      null,
      []
    );
    expect(result.stateSaved).toBe(false);
    expect(result.evidenceSaved).toBe(true);
  });
});
