import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueOp, loadQueue, markOpSyncing } from '../queue';
import { flushSyncQueue, registerSyncHandler } from '../syncWorker';

function installStorage() {
  const store = new Map<string, string>();
  // @ts-expect-error test polyfill
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
  // @ts-expect-error test polyfill
  globalThis.window = globalThis;
}

describe('offline sync worker', () => {
  beforeEach(() => {
    installStorage();
  });

  it('retries a syncing operation left behind by an interrupted session', async () => {
    const handler = vi.fn(async () => undefined);
    registerSyncHandler('task', handler);
    const op = enqueueOp('recover-user', {
      entity: 'task',
      action: 'update',
      entityId: 'task-1',
      payload: { id: 'task-1', status: 'done' },
      clientOpId: 'recover-op',
    });
    markOpSyncing('recover-user', op.id);

    const result = await flushSyncQueue('recover-user');

    expect(result).toEqual({ flushed: 1, failed: 0 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(loadQueue('recover-user').find((item) => item.id === op.id)?.status).toBe('done');
  });

  it('does not let one account block another account sync', async () => {
    const calls: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    registerSyncHandler('task', async (op) => {
      calls.push(op.userId);
      if (op.userId === 'parallel-a') await firstGate;
    });
    enqueueOp('parallel-a', {
      entity: 'task', action: 'update', entityId: 'a',
      payload: { id: 'a', status: 'done' }, clientOpId: 'parallel-a-op',
    });
    enqueueOp('parallel-b', {
      entity: 'task', action: 'update', entityId: 'b',
      payload: { id: 'b', status: 'done' }, clientOpId: 'parallel-b-op',
    });

    const first = flushSyncQueue('parallel-a');
    await Promise.resolve();
    const second = await flushSyncQueue('parallel-b');
    releaseFirst();
    const firstResult = await first;

    expect(second).toEqual({ flushed: 1, failed: 0 });
    expect(firstResult).toEqual({ flushed: 1, failed: 0 });
    expect(calls).toEqual(expect.arrayContaining(['parallel-a', 'parallel-b']));
  });
});
