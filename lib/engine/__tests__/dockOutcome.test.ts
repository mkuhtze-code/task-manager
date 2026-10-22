import { describe, expect, it } from 'vitest';
import { allowCreate, classifyCaptureDockOutcome } from '../dockOutcome';
import type { CaptureDockResult } from '../captureDock';

function result(kind: CaptureDockResult['kind'], message = 'Capacity is strained'): CaptureDockResult {
  if (kind === 'act_create' || kind === 'act_update') {
    return { kind, message, request: {} as never, overrides: { text: 'Call client' }, cpuCycle: {} as never };
  }
  if (kind === 'fallthrough') return { kind, message, request: null };
  return { kind, message, request: {} as never };
}

describe('explicit-create dock outcome policy', () => {
  it.each([
    ['act_create', 'act', true],
    ['act_update', 'act', true],
    ['answer', 'advisory', true],
    ['defer', 'advisory', true],
    ['clarify', 'clarify', true],
    ['fallthrough', 'clarify', true],
  ] as const)('%s classifies as %s and allows explicit create', (kind, expectedClass, allowed) => {
    const classified = classifyCaptureDockOutcome(result(kind));
    expect(classified.class).toBe(expectedClass);
    expect(allowCreate('explicit_create', classified.class)).toBe(allowed);
  });

  it('does not turn an advisory into a write on a non-create surface', () => {
    expect(allowCreate('other', 'advisory')).toBe(false);
  });

  it('hard blocks remain hard for every surface', () => {
    expect(allowCreate('explicit_create', 'hard')).toBe(false);
    expect(allowCreate('other', 'hard')).toBe(false);
  });
});
