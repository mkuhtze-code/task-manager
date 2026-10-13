import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCaptureDock, type CaptureDockResult } from '@/lib/engine/captureDock';
import { loadActiveRequestLocal, saveActiveRequestLocal } from '@/lib/engine/persist';
import { emptyRequest } from '@/lib/engine/request';

const TODAY = '2026-10-14';
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

function dock(line: string, priorRequest: ReturnType<typeof emptyRequest> | null = null): CaptureDockResult {
  return runCaptureDock({
    line,
    userId: null,
    priorRequest,
    jobs: [],
    captureJobId: null,
    captureSurfaceDate: TODAY,
    remainingMinsToday: 240,
    openTaskCount: 0,
    inputType: 'text',
    meetings: [],
  });
}

function requireCreate(result: CaptureDockResult, line: string) {
  expect(result.kind, `Expected a new task for "${line}", got ${result.kind}: ${result.message}`).toBe('act_create');
  if (result.kind !== 'act_create') throw new Error(`Expected act_create for "${line}"`);
  return result;
}

describe('Capture Phase 3 — Dock prior-request boundary', () => {
  it('treats explicit null as fresh capture even when persisted active request is stale', () => {
    const stale = emptyRequest('create_task');
    stale.titleText = 'Call John about the old invoice';
    stale.primaryVerb = 'call';
    stale.personText = 'John';
    stale.objectText = 'old invoice';
    stale.rawUtterances = ['Call John about the old invoice tomorrow'];
    saveActiveRequestLocal(stale, null);

    const result = requireCreate(dock('Call Sarah about the invoice', null), 'Call Sarah about the invoice');

    expect(result.request.id).not.toBe(stale.id);
    expect(result.request.personText?.toLowerCase()).not.toContain('john');
    expect(result.overrides.text.toLowerCase()).toContain('sarah');
    expect(result.overrides.text.toLowerCase()).not.toContain('john');
  });

  it('keeps three sequential same-verb creates separate through the full Dock and CPU path', () => {
    const lines = [
      'Call Sarah about the invoice',
      'Call John about the measurements',
      'Call Mike about the delivery',
    ];

    const results = lines.map((line) => requireCreate(dock(line, null), line));

    expect(new Set(results.map((result) => result.request.id)).size).toBe(3);
    expect(results.map((result) => result.overrides.text.toLowerCase())).toEqual(
      expect.arrayContaining([
        expect.stringContaining('sarah'),
        expect.stringContaining('john'),
        expect.stringContaining('mike'),
      ]),
    );
    expect(loadActiveRequestLocal(null)).toBeNull();
  });
});
