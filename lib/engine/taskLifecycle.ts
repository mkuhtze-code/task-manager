import type { EngineRequest, WorkingMemorySnapshot } from './types';

export type CompletedTaskContextRelease = {
  cleared: boolean;
  activeRequest: EngineRequest | null;
  workingMemory: WorkingMemorySnapshot;
};

/**
 * A task-bound request is a refinement context, not a permanent association.
 * Completing that task closes the refinement chain so the next standalone
 * capture cannot inherit its title or object. Historical memory remains.
 */
export function releaseCompletedTaskContext(
  taskId: string,
  activeRequest: EngineRequest | null,
  workingMemory: WorkingMemorySnapshot,
): CompletedTaskContextRelease {
  const taskBinding = activeRequest?.constraints.find(
    (constraint) =>
      constraint.axis === 'dependency' &&
      constraint.value === `task:${taskId}`,
  );

  if (!activeRequest || !taskBinding) {
    return { cleared: false, activeRequest, workingMemory };
  }

  const focus = workingMemory.currentFocus;
  const currentFocus =
    focus.kind === 'task' && focus.id === taskId
      ? { kind: 'none' as const, id: null, label: null }
      : focus;

  return {
    cleared: true,
    activeRequest: null,
    workingMemory: {
      ...workingMemory,
      activeRequestId:
        workingMemory.activeRequestId === activeRequest.id
          ? null
          : workingMemory.activeRequestId,
      currentFocus,
      updatedAt: new Date().toISOString(),
    },
  };
}
