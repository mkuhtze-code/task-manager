import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCaptureDock, type CaptureDockResult } from '@/lib/engine/captureDock';
import { bindRequestToTask, bindTaskToWorkingMemory, saveActiveRequestLocal, saveWorkingMemoryLocal } from '@/lib/engine/persist';
import { emptyWorkingMemory } from '@/lib/engine/workingMemory';
import type { EngineRequest } from '@/lib/engine/types';

const TODAY = '2026-10-09';
const TASK_ID = 'phase-m-persisted-task-001';
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

function requireCreate(result: CaptureDockResult, input: string) {
  expect(result.kind, `Expected a new task for "${input}", got ${result.kind}: ${result.message}`).toBe('act_create');
  if (result.kind !== 'act_create') throw new Error(`Expected act_create for: ${input}`);
  return result;
}

function requireUpdate(result: CaptureDockResult, input: string) {
  expect(result.kind, `Expected an update for "${input}", got ${result.kind}: ${result.message}`).toBe('act_update');
  if (result.kind !== 'act_update') throw new Error(`Expected act_update for: ${input}`);
  expect(result.overrides.updateTaskId, 'A follow-up must target the persisted task, not a transient request.').toBe(TASK_ID);
  return result;
}

function makeBoundTask() {
  const input = 'I need to call Jordan about the Smith Street flashing.';
  const first = requireCreate(dock(input), input);
  const request = first.overrides.engineRequest;
  expect(request, 'Create action must retain its structured request.').toBeTruthy();
  if (!request) throw new Error('Missing engine request');
  const boundRequest = bindRequestToTask(request, TASK_ID);
  const memory = bindTaskToWorkingMemory(first.overrides.workingMemory ?? emptyWorkingMemory(), {
    taskId: TASK_ID,
    taskText: first.overrides.text,
    locationText: first.overrides.locationText,
    jobId: first.overrides.jobId,
    requestId: boundRequest.id,
  });
  saveActiveRequestLocal(boundRequest, null);
  saveWorkingMemoryLocal(memory, null);
  return boundRequest;
}

describe('Phase M — adversarial task continuity and reference resolution', () => {
  it('resolves “Move it to Friday” to the same persisted task and a concrete date', () => {
    const result = requireUpdate(dock('Move it to Friday.', makeBoundTask()), 'Move it to Friday.');
    expect(result.overrides.surfaceDate).toBe('2026-10-09');
    expect(result.overrides.text.toLowerCase()).toContain('call');
    expect(result.overrides.text.toLowerCase()).toContain('jordan');
  });

  it('applies a later weekday correction to the same task rather than retaining the first date', () => {
    const first = requireUpdate(dock('Move it to Friday.', makeBoundTask()), 'Move it to Friday.');
    const corrected = requireUpdate(dock('Actually, make that Monday.', first.request), 'Actually, make that Monday.');
    expect(corrected.overrides.surfaceDate).toBe('2026-10-12');
    expect(corrected.overrides.text.toLowerCase()).toContain('call');
    expect(corrected.overrides.text.toLowerCase()).toContain('jordan');
  });

  it('changes the time without discarding the already established date', () => {
    const moved = requireUpdate(dock('Move it to Monday.', makeBoundTask()), 'Move it to Monday.');
    const retimed = requireUpdate(
      dock('Change the time to 3pm, but leave the date alone.', moved.request),
      'Change the time to 3pm, but leave the date alone.',
    );
    expect(retimed.overrides.surfaceDate).toBe('2026-10-12');
    expect(retimed.request.timeHint).toMatch(/3\\s*:?\\s*00?\\s*pm|15:00|3pm/i);
  });

  it('treats weekday-plus-time phrases as scheduling, not as a replacement location', () => {
    const original = makeBoundTask();
    const moved = requireUpdate(
      dock('Move it to Monday at 3pm.', original),
      'Move it to Monday at 3pm.',
    );
    expect(moved.overrides.surfaceDate).toBe('2026-10-12');
    expect(moved.request.timeHint).toBe('15:00');
    expect(moved.overrides.locationText).toBe('Smith Street');
    expect(moved.overrides.text.toLowerCase()).toContain('call jordan');
  });

  it('preserves task identity and title when only the schedule changes', () => {
    const original = makeBoundTask();
    const result = requireUpdate(
      dock('Move it to Friday, but do not change anything else.', original),
      'Move it to Friday, but do not change anything else.',
    );
    expect(result.overrides.updateTaskId).toBe(TASK_ID);
    expect(result.overrides.text.toLowerCase()).toContain('call');
    expect(result.overrides.text.toLowerCase()).toContain('jordan');
    expect(result.overrides.text.toLowerCase()).toContain('flashing');
  });

  it('starts a fresh quote task instead of contaminating it with the active task', () => {
    const result = requireCreate(
      dock('Quote for Korohata Terrace', makeBoundTask()),
      'Quote for Korohata Terrace',
    );
    expect(result.overrides.text.toLowerCase()).toContain('quote');
    expect(result.overrides.text.toLowerCase()).toContain('korohata');
    expect(result.overrides.text.toLowerCase()).not.toMatch(/jordan|smith street|flashing/);
    expect(result.overrides.locationText?.toLowerCase()).toContain('korohata');
  });

  it('does not mutate a task when the user explicitly says to keep it unchanged and create a separate task', () => {
    const result = requireCreate(
      dock('Leave the original as it is and create a separate task to email Sarah about the revised quote.', makeBoundTask()),
      'Leave the original as it is and create a separate task to email Sarah about the revised quote.',
    );
    expect(result.overrides.text.toLowerCase()).toContain('email');
    expect(result.overrides.text.toLowerCase()).toContain('sarah');
    expect(result.overrides.text.toLowerCase()).toContain('quote');
  });

  it('does not guess which task the user means when the reference explicitly rejects the current one', () => {
    const result = dock('Not that one — the other Smith Street task.', makeBoundTask());
    expect(
      result.kind,
      'A rejected reference must not silently update the previously focused task.',
    ).not.toBe('act_update');
  });

  it('keeps a new request isolated from prior content even when it shares a location concept', () => {
    const result = requireCreate(
      dock('Check the flashing at Smith Street.', makeBoundTask()),
      'Check the flashing at Smith Street.',
    );
    expect(result.overrides.text.toLowerCase()).toContain('check');
    expect(result.overrides.text.toLowerCase()).not.toContain('call jordan');
  });
});
