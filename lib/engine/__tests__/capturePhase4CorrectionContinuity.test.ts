import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCaptureDock, type CaptureDockResult } from '@/lib/engine/captureDock';
import {
  bindRequestToTask,
  bindTaskToWorkingMemory,
  saveActiveRequestLocal,
  saveWorkingMemoryLocal,
} from '@/lib/engine/persist';
import { emptyWorkingMemory } from '@/lib/engine/workingMemory';
import type { EngineRequest } from '@/lib/engine/types';

const TODAY = '2026-10-14';
const TASK_ID = 'phase-4-correction-task';
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: new MemoryStorage(),
  });
});

afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

function dock(line: string, priorRequest: EngineRequest | null = null): CaptureDockResult {
  return runCaptureDock({
    line,
    userId: null,
    priorRequest,
    jobs: [
      { id: 'job-smith', name: 'Smith Street', locationText: 'Smith Street' },
      { id: 'job-korohata', name: 'Korohata Terrace', locationText: '12 Korohata Terrace' },
    ],
    captureJobId: null,
    captureSurfaceDate: TODAY,
    remainingMinsToday: 240,
    openTaskCount: 1,
    inputType: 'text',
    meetings: [],
  });
}

function requireCreate(result: CaptureDockResult, line: string) {
  expect(result.kind, `Expected create for "${line}", got ${result.kind}: ${result.message}`).toBe('act_create');
  if (result.kind !== 'act_create') throw new Error(`Expected act_create for "${line}"`);
  return result;
}

function requireUpdate(result: CaptureDockResult, line: string) {
  expect(result.kind, `Expected update for "${line}", got ${result.kind}: ${result.message}`).toBe('act_update');
  if (result.kind !== 'act_update') throw new Error(`Expected act_update for "${line}"`);
  expect(result.overrides.updateTaskId).toBe(TASK_ID);
  return result;
}

function makeBoundTask() {
  const line = 'I need to call Jordan about the Smith Street flashing.';
  const created = requireCreate(dock(line), line);
  const request = created.overrides.engineRequest;
  expect(request).toBeTruthy();
  if (!request) throw new Error('Missing engine request');
  const bound = bindRequestToTask(request, TASK_ID);
  const memory = bindTaskToWorkingMemory(
    created.overrides.workingMemory ?? emptyWorkingMemory(),
    {
      taskId: TASK_ID,
      taskText: created.overrides.text,
      locationText: created.overrides.locationText,
      jobId: created.overrides.jobId,
      requestId: bound.id,
    },
  );
  saveActiveRequestLocal(bound, null);
  saveWorkingMemoryLocal(memory, null);
  return bound;
}

describe('Capture Phase 4 — correction continuity through Dock and CPU', () => {
  it('applies a location-only correction to the bound task without losing its title', () => {
    const original = makeBoundTask();
    const result = requireUpdate(dock('No, Mitre 10.', original), 'No, Mitre 10.');

    expect(result.overrides.text.toLowerCase()).toContain('call');
    expect(result.overrides.text.toLowerCase()).toContain('jordan');
    expect(result.overrides.text.toLowerCase()).toContain('flashing');
    expect(result.overrides.locationText?.toLowerCase()).toContain('mitre 10');
    expect(result.request.id).toBe(original.id);
  });

  it('keeps a new same-verb task separate from the bound task', () => {
    const original = makeBoundTask();
    const line = 'Call Sarah about the revised proposal.';
    const result = requireCreate(dock(line, original), line);

    expect(result.overrides.text.toLowerCase()).toContain('sarah');
    expect(result.overrides.text.toLowerCase()).toContain('proposal');
    expect(result.overrides.text.toLowerCase()).not.toContain('jordan');
    expect(result.overrides.text.toLowerCase()).not.toContain('smith street');
    expect(result.request.id).not.toBe(original.id);
  });

  it('keeps a scheduling-only follow-up attached to the same task', () => {
    const original = makeBoundTask();
    const result = requireUpdate(dock('Move it to Friday at 3pm.', original), 'Move it to Friday at 3pm.');

    expect(result.overrides.text.toLowerCase()).toContain('call');
    expect(result.overrides.text.toLowerCase()).toContain('jordan');
    expect(result.overrides.locationText?.toLowerCase()).toContain('smith street');
    expect(result.request.id).toBe(original.id);
    expect(result.request.timeHint).toBe('15:00');
  });
});
