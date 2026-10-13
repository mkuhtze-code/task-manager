import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCaptureDock, type CaptureDockResult } from '@/lib/engine/captureDock';
import { saveActiveRequestLocal } from '@/lib/engine/persist';

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

function dock(line: string, priorRequest: Parameters<typeof runCaptureDock>[0]['priorRequest'] = null): CaptureDockResult {
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

describe('Capture Phase 5 — sequential regression pack', () => {
  it('does not treat a repeated action word as sufficient continuity for the prior task', () => {
    const first = dock('Call John about the invoice tomorrow');
    expect(first.kind).toBe('act_create');
    if (first.kind !== 'act_create') throw new Error('Expected the first request to create a task');

    // Recreate the persisted state that previously let a bare repeated verb
    // inherit the old request. A new capture must establish its own identity.
    saveActiveRequestLocal(first.request, null);
    const second = dock('Call', first.request);

    expect(second.kind).not.toBe('act_update');
    expect(second.request.id).not.toBe(first.request.id);
    expect(second.request.personText?.toLowerCase() ?? '').not.toContain('john');
  });

  it('keeps consecutive same-verb tasks isolated when each capture is explicitly fresh', () => {
    const lines = [
      'Call Sarah about the invoice',
      'Call John about the measurements',
      'Call Mike about the delivery',
    ];
    const results = lines.map((line) => dock(line, null));

    for (let index = 0; index < results.length; index += 1) {
      expect(results[index].kind, `Unexpected result for "${lines[index]}"`).toBe('act_create');
    }
    const creates = results.filter((result) => result.kind === 'act_create');
    expect(creates).toHaveLength(3);
    expect(new Set(creates.map((result) => result.request.id)).size).toBe(3);
    expect(creates.map((result) => result.overrides.text.toLowerCase()).join('\n')).toContain('sarah');
    expect(creates.map((result) => result.overrides.text.toLowerCase()).join('\n')).toContain('john');
    expect(creates.map((result) => result.overrides.text.toLowerCase()).join('\n')).toContain('mike');
  });
});
