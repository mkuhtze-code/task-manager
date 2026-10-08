import { describe, expect, it } from 'vitest';
import { runConversation, runEngineCycle } from '../orchestrate';
import { emptyWorkingMemory, makeMemoryItem } from '../workingMemory';
import { resolveReference } from '../references';

describe('Phase 10 — discourse and reference resolution', () => {
  it('resolves "it" to the active task rather than an unrelated recent entity', () => {
    const mem = emptyWorkingMemory();
    const task = makeMemoryItem({
      id: 'task-1',
      type: 'task',
      label: 'Order the flashing',
      source: 'test',
      salience: 0.7,
    });
    const unrelated = makeMemoryItem({
      id: 'entity-1',
      type: 'entity',
      label: 'Jordan',
      source: 'test',
      salience: 0.95,
    });
    const focused = {
      ...mem,
      recentTasks: [task],
      recentEntities: [unrelated],
      currentFocus: { kind: 'task' as const, id: task.id, label: task.label },
    };

    const resolved = resolveReference('change it to Friday', focused);
    expect(resolved.status).toBe('resolved');
    if (resolved.status === 'resolved') expect(resolved.item.id).toBe(task.id);
  });

  it('resolves "there" from the most recent location context', () => {
    const mem = emptyWorkingMemory();
    const oldLoc = makeMemoryItem({
      id: 'loc-old',
      type: 'location',
      label: 'Angela Place',
      source: 'test',
      salience: 0.7,
      timestamp: '2026-10-08T08:00:00.000Z',
    });
    const newLoc = makeMemoryItem({
      id: 'loc-new',
      type: 'location',
      label: '64 Grace James Road, Pukekohe',
      source: 'test',
      salience: 0.7,
      timestamp: '2026-10-09T08:05:00.000Z',
    });
    const resolved = resolveReference('go there', {
      ...mem,
      recentLocations: [newLoc, oldLoc],
    });
    expect(resolved.status).toBe('resolved');
    if (resolved.status === 'resolved') expect(resolved.item.id).toBe(newLoc.id);
  });

  it('does not manufacture ambiguity from duplicate memory entries', () => {
    const mem = emptyWorkingMemory();
    const task = makeMemoryItem({
      id: 'same-task',
      type: 'task',
      label: 'Call Jason',
      source: 'test',
      salience: 0.8,
    });
    const resolved = resolveReference('do that', {
      ...mem,
      recentTasks: [task],
      recentActions: [task],
    });
    expect(resolved.status).toBe('resolved');
  });

  it('asks instead of acting when a reference has two equally plausible antecedents', () => {
    const mem = emptyWorkingMemory();
    const a = makeMemoryItem({
      id: 'a',
      type: 'task',
      label: 'Call Jason',
      source: 'test',
      salience: 0.8,
    });
    const b = makeMemoryItem({
      id: 'b',
      type: 'task',
      label: 'Call Jordan',
      source: 'test',
      salience: 0.8,
    });
    const result = runEngineCycle({
      utterance: 'change that to Friday',
      workingMemory: { ...mem, recentTasks: [a, b] },
    });
    expect(result.action.kind).toBe('ask');
    expect(result.action.kind === 'ask' ? result.action.message : '').toBe('Which one did you mean?');
  });

  it('asks when "it" has no antecedent', () => {
    const result = runEngineCycle({
      utterance: 'change it to Friday',
      workingMemory: emptyWorkingMemory(),
    });
    expect(result.action.kind).toBe('ask');
  });

  it('keeps a resolved task reference on the same request path', () => {
    const first = runConversation(['I need to call Jordan tomorrow']);
    const second = runConversation([
      'I need to call Jordan tomorrow',
      'actually make that Friday',
    ]);
    expect(second[1].request.id).toBe(second[0].request.id);
    expect(second[1].request.dateHint).toBe('friday');
  });

  it('does not treat ordinary scheduled captures as discourse refinements', () => {
    const results = runConversation([
      'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today',
      'I need to call Jordan tomorrow',
    ]);
    expect(results[0].action.kind).toBe('create_task');
    expect(results[1].request.id).not.toBe(results[0].request.id);
  });
});
