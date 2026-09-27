// lib/thinking/v3/identity.ts
//
// Phase 5.5 — stable task identity is not task text.
// Duplicate text must never collapse separate tasks.

export type TaskIdentityRef = {
  taskId: string;
  text: string;
  userId: string;
};

export type TaskFeatures = {
  taskId: string;
  tokens: string[];
  discriminativeTokens: string[];
  jobId: string | null;
  hasSubtasks: boolean;
  source: string | null;
};

export function sameTaskIdentity(a: TaskIdentityRef, b: TaskIdentityRef): boolean {
  return a.taskId === b.taskId && a.userId === b.userId;
}

export function distinctDespiteSameText(
  a: TaskIdentityRef,
  b: TaskIdentityRef
): boolean {
  return a.text === b.text && a.taskId !== b.taskId;
}

export type SequenceEdge = {
  fromTaskId: string;
  toTaskId: string;
  fromText?: string;
  toText?: string;
};

export function sequenceEdge(
  fromTaskId: string,
  toTaskId: string,
  texts?: { from?: string; to?: string }
): SequenceEdge {
  return {
    fromTaskId,
    toTaskId,
    fromText: texts?.from,
    toText: texts?.to,
  };
}

export function taskKeyedMap<V>(): Map<string, V> {
  return new Map();
}

export function assertTaskId(id: string | null | undefined): string {
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('taskId required — text is not identity');
  }
  return id;
}
