import { afterEach, describe, expect, it } from 'vitest';
import { runCaptureDock } from '@/lib/engine/captureDock';
import {
  bindRequestToTask,
  bindTaskToWorkingMemory,
  loadActiveRequestLocal,
  loadWorkingMemoryLocal,
  saveActiveRequestLocal,
  saveWorkingMemoryLocal,
} from '@/lib/engine/persist';

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

function dock(line: string, userId: string, priorRequest = loadActiveRequestLocal(userId)) {
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

describe('Phase G — persisted capture to next-turn replay', () => {
  it('binds a committed task ID into persisted working memory and resolves the next turn to it', () => {
    installStorage();
    const userId = 'phase-g-replay-user';

    const first = dock('I need to call Jordan about the Smith Street flashing.', userId, null);
    expect(first.kind).toBe('act_create');
    if (first.kind !== 'act_create') return;
    expect(first.overrides.engineRequest).toBeDefined();

    // This is the same boundary used by Today after the database insert succeeds.
    const taskId = 'persisted-task-001';
    const boundRequest = bindRequestToTask(first.overrides.engineRequest!, taskId);
    const memory = bindTaskToWorkingMemory(first.overrides.workingMemory ?? loadWorkingMemoryLocal(userId), {
      taskId,
      taskText: first.overrides.text,
      locationText: first.overrides.locationText,
      jobId: first.overrides.jobId,
      requestId: boundRequest.id,
    });
    saveActiveRequestLocal(boundRequest, userId);
    saveWorkingMemoryLocal(memory, userId);

    // Simulate a fresh capture surface: reload both values from persistence.
    const reloadedRequest = loadActiveRequestLocal(userId);
    const reloadedMemory = loadWorkingMemoryLocal(userId);
    expect(reloadedMemory.recentTasks.some((item) => item.id === taskId)).toBe(true);
    expect(reloadedMemory.currentFocus).toEqual({
      kind: 'task',
      id: taskId,
      label: first.overrides.text,
    });

    const second = dock('Move it to Friday.', userId, reloadedRequest);
    expect(second.kind).toBe('act_update');
    if (second.kind === 'act_update') {
      expect(second.overrides.updateTaskId).toBe(taskId);
    }
  });

  it('does not leak one account’s working memory or active request into another account', () => {
    const storage = installStorage();
    const userA = 'phase-g-user-a';
    const userB = 'phase-g-user-b';

    saveWorkingMemoryLocal({
      ...loadWorkingMemoryLocal(userA),
      recentTasks: [{
        id: 'private-task-a',
        type: 'task',
        label: 'Private task from account A',
        source: 'test',
        timestamp: '2026-10-09T08:00:00.000Z',
        salience: 1,
        confidence: 'high',
        relationships: {},
      }],
    }, userA);
    saveActiveRequestLocal({
      id: 'private-request-a',
      action: 'create_task',
      objectText: 'Private task from account A',
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
      rawUtterances: ['Private task from account A'],
      titleText: 'Private task from account A',
      confidence: 'high',
      updatedAt: '2026-10-09T08:00:00.000Z',
    }, userA);

    expect(storage.getItem('dokkit.engine.workingMemory.v1')).toBeNull();
    expect(storage.getItem('dokkit.engine.activeRequest.v1')).toBeNull();
    expect(loadWorkingMemoryLocal(userB).recentTasks).toEqual([]);
    expect(loadActiveRequestLocal(userB)).toBeNull();
    expect(loadWorkingMemoryLocal(userA).recentTasks[0]?.id).toBe('private-task-a');
    expect(loadActiveRequestLocal(userA)?.id).toBe('private-request-a');
  });
});
