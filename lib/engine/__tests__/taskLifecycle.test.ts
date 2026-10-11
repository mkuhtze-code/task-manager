import { describe, expect, it } from 'vitest';
import { emptyRequest } from '../request';
import { releaseCompletedTaskContext } from '../taskLifecycle';
import { emptyWorkingMemory } from '../workingMemory';

describe('completed task context lifecycle', () => {
  it('releases only the refinement binding for the task that was completed', () => {
    const request = {
      ...emptyRequest('create_task'),
      id: 'request-chase-jon',
      constraints: [
        { axis: 'dependency' as const, value: 'task:task-chase-jon', confidence: 'high' as const, source: 'task_binding' },
      ],
    };
    const memory = {
      ...emptyWorkingMemory(),
      activeRequestId: request.id,
      currentFocus: { kind: 'task' as const, id: 'task-chase-jon', label: 'Chase up Jon for the remaining 6 end caps' },
    };

    const released = releaseCompletedTaskContext('task-chase-jon', request, memory);

    expect(released.cleared).toBe(true);
    expect(released.activeRequest).toBeNull();
    expect(released.workingMemory.activeRequestId).toBeNull();
    expect(released.workingMemory.currentFocus).toEqual({ kind: 'none', id: null, label: null });
    expect(memory.recentTasks).toEqual([]);
  });

  it('does not clear an unrelated active task binding', () => {
    const request = {
      ...emptyRequest('create_task'),
      id: 'request-other',
      constraints: [
        { axis: 'dependency' as const, value: 'task:task-other', confidence: 'high' as const, source: 'task_binding' },
      ],
    };
    const memory = { ...emptyWorkingMemory(), activeRequestId: request.id };

    const released = releaseCompletedTaskContext('task-chase-jon', request, memory);

    expect(released.cleared).toBe(false);
    expect(released.activeRequest).toBe(request);
    expect(released.workingMemory).toBe(memory);
  });
});
