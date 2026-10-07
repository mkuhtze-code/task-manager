import { describe, expect, it } from 'vitest';
import { processCpuInteraction, resolveContextReference } from '../index';
import type { CpuInput } from '../types';
import { emptyWorkingMemory, makeMemoryItem, setFocus } from '@/lib/engine/workingMemory';

function input(text: string, overrides: Partial<CpuInput['context']> = {}): CpuInput {
  return {
    userId: 'phase3-test',
    input: { type: 'text', text },
    context: { interface: 'capture', surface: 'today', todayDate: '2026-10-08', jobs: [], meetings: [], ...overrides },
    dryRun: true,
  };
}

describe('Dokkit CPU Phase 3 — reconciliation', () => {
  it('keeps an explicit user commitment actionable even when capacity is tight', () => {
    const result = processCpuInteraction({
      userId: 'phase3-test',
      input: {
        type: 'text',
        text: 'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today',
      },
      context: {
        interface: 'capture',
        surface: 'today',
        todayDate: '2026-10-07',
        remainingMinsToday: 10,
        openTaskCount: 3,
        jobs: [],
        meetings: [],
      },
      dryRun: true,
    });

    expect(result.decision.outcome).toBe('ACT');
    expect(result.decision.action?.kind).toBe('create_task');
    expect(result.decision.authority.mayAct).toBe(true);
    expect(result.decision.recommendedAction?.kind).toBe('create_task');
  });

  it('surfaces a contextual job relationship without changing the primary action', () => {
    const result = processCpuInteraction({
      userId: 'phase3-test',
      input: {
        type: 'text',
        text: 'Ask Smith about the flashing',
      },
      context: {
        interface: 'today',
        surface: 'today',
        todayDate: '2026-10-07',
        jobs: [{ id: 'job-smith', name: 'Smith house', locationText: null }],
        meetings: [],
      },
      dryRun: true,
    });

    expect(result.decision.outcome).toBeDefined();
    expect(result.decision.opportunities.some((o) => o.kind === 'job')).toBe(true);
    expect(result.decision.opportunities.find((o) => o.kind === 'job')?.entityIds).toContain('job-smith');
  });

  it('does not invent opportunities when the relevant context is unavailable', () => {
    const result = processCpuInteraction({
      userId: 'phase3-test',
      input: {
        type: 'text',
        text: 'Check flight tickets',
      },
      context: {
        interface: 'today',
        surface: 'today',
        todayDate: '2026-10-07',
        jobs: [],
        meetings: [],
      },
      dryRun: true,
    });

    expect(result.decision.opportunities).toEqual([]);
    expect(result.decision.conflicts).toEqual([]);
  });
  it('resolves "add this" from current list focus', () => {
    let mem = emptyWorkingMemory('today');
    mem = setFocus(mem, { kind: 'list', id: 'list-1', label: 'Grocery List' });
    const result = resolveContextReference(input('add this'), null, mem);
    expect(result.status).toBe('resolved');
    expect(result.target?.id).toBe('list-1');
    expect(result.target?.reasons).toContain('focus_match');
  });

  it('does not guess between similarly plausible jobs', () => {
    const result = resolveContextReference(
      input('update that job', {
        jobs: [
          { id: 'job-1', name: 'Smith renovation' },
          { id: 'job-2', name: 'Jones renovation' },
        ],
      }),
      null,
      emptyWorkingMemory('jobs')
    );
    expect(result.status).toBe('ambiguous');
    expect(result.target).toBeNull();
    expect(result.candidates.length).toBe(2);
  });

  it('uses explicit recency for "the last one"', () => {
    let mem = emptyWorkingMemory('today');
    mem = {
      ...mem,
      recentTasks: [
        makeMemoryItem({ id: 'task-new', type: 'task', label: 'Check flashings', source: 'test', timestamp: '2026-10-08T09:00:00.000Z', salience: 0.5 }),
        makeMemoryItem({ id: 'task-old', type: 'task', label: 'Call supplier', source: 'test', timestamp: '2026-10-08T08:00:00.000Z', salience: 0.9 }),
      ],
    };
    const result = resolveContextReference(input('move the last one to tomorrow'), null, mem);
    expect(result.status).toBe('resolved');
    expect(result.target?.id).toBe('task-new');
    expect(result.reason).toBe('explicit_recency_reference');
  });

  it('uses the same resolver for Android Auto', () => {
    let mem = emptyWorkingMemory('today');
    mem = setFocus(mem, { kind: 'task', id: 'task-1', label: 'Pick up flashing' });
    const auto = input('move it to tomorrow', { interface: 'android_auto' });
    auto.cpu = { interface: 'android_auto' };
    const result = resolveContextReference(auto, null, mem);
    expect(result.status).toBe('resolved');
    expect(result.target?.id).toBe('task-1');
  });

});