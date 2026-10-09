import { describe, expect, it } from 'vitest';
import { emptyWorkingMemory, setFocus } from '@/lib/engine/workingMemory';
import { isEngineRequest, isWorkingMemorySnapshot } from '@/lib/engine/persistValidation';
import { hydrateEngineStateRemote, saveActiveRequestLocal, saveWorkingMemoryLocal } from '@/lib/engine/persist';
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
    configurable: true, writable: true, value: storage,
  });
  return storage;
}

function validRequest(): EngineRequest {
  return {
    id: 'request-1', action: 'create_task', objectText: 'Call Jordan',
    locationText: null, relatedJobText: null, relatedMeetingText: null,
    dateHint: null, timeHint: null, urgency: 'none', flexibility: 'medium',
    commitment: 'weak', consequence: null, constraints: [], rawUtterances: ['Call Jordan'],
    titleText: 'Call Jordan', confidence: 'high', updatedAt: '2026-10-09T09:00:00.000Z',
  };
}

function makeClient(row: Record<string, unknown>) {
  return {
    from: () => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: async () => ({
            data: row.user_id === value ? row : null,
            error: null,
          }),
        }),
      }),
    }),
  } as never;
}

describe('Phase I — validate remote engine context before hydration', () => {
  it('accepts a well-formed versioned working-memory snapshot and request', () => {
    const memory = setFocus(emptyWorkingMemory(), { kind: 'task', id: 'task-1', label: 'Call Jordan' });
    expect(isWorkingMemorySnapshot(memory)).toBe(true);
    expect(isEngineRequest(validRequest())).toBe(true);
  });

  it('rejects version-correct memory with missing arrays or malformed focus', () => {
    const memory = emptyWorkingMemory();
    expect(isWorkingMemorySnapshot({ ...memory, recentTasks: null })).toBe(false);
    expect(isWorkingMemorySnapshot({ ...memory, currentFocus: { kind: 'unknown', id: null, label: null } })).toBe(false);
    expect(isWorkingMemorySnapshot({ ...memory, recentEntities: Array(501).fill({}) })).toBe(false);
  });

  it('rejects a request whose constraints are malformed even when its ID is present', () => {
    expect(isEngineRequest({ ...validRequest(), constraints: [{ axis: 'unknown', value: 7 }] })).toBe(false);
    expect(isEngineRequest({ ...validRequest(), updatedAt: 'not-a-date' })).toBe(false);
  });

  it('does not replace valid local context with malformed remote JSONB', async () => {
    installStorage();
    const userId = 'phase-i-user';
    const localMemory: WorkingMemorySnapshot = setFocus(emptyWorkingMemory(), {
      kind: 'task', id: 'local-task', label: 'Local known-good task',
    });
    const localRequest = validRequest();
    saveWorkingMemoryLocal(localMemory, userId);
    saveActiveRequestLocal(localRequest, userId);

    const hydrated = await hydrateEngineStateRemote(makeClient({
      user_id: userId,
      engine_working_memory: { version: 1, updatedAt: '2026-10-09T09:00:00Z', recentTasks: 'corrupt' },
      engine_active_request: { id: 'remote-request-corrupt' },
    }), userId);

    expect(hydrated.memory.currentFocus.id).toBe('local-task');
    expect(hydrated.activeRequest?.id).toBe('request-1');
  });

  it('treats an explicit remote null request as cleared only with a valid memory snapshot', async () => {
    installStorage();
    const userId = 'phase-i-clear-user';
    const memory = emptyWorkingMemory();
    const localRequest = validRequest();
    saveActiveRequestLocal(localRequest, userId);

    const hydrated = await hydrateEngineStateRemote(makeClient({
      user_id: userId,
      engine_working_memory: memory,
      engine_active_request: null,
    }), userId);

    expect(hydrated.activeRequest).toBeNull();
  });
});
