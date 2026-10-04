import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueueOp,
  listPendingOps,
  markOpDone,
  markOpFailed,
  pendingCount,
  loadQueue,
} from '../queue';
import { makeClientOpId } from '../types';

beforeEach(() => {
  const store = new Map<string, string>();
  // @ts-expect-error test polyfill
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
  // @ts-expect-error test polyfill
  globalThis.window = globalThis;
});

describe('offline queue', () => {
  it('enqueues and lists pending', () => {
    const op = enqueueOp('u1', {
      entity: 'task',
      action: 'update',
      entityId: 't1',
      payload: { id: 't1', status: 'done' },
      clientOpId: 'op-a',
    });
    expect(op.clientOpId).toBe('op-a');
    expect(listPendingOps('u1')).toHaveLength(1);
    expect(pendingCount('u1')).toBe(1);
  });

  it('dedupes by clientOpId', () => {
    enqueueOp('u1', {
      entity: 'task',
      action: 'update',
      payload: { id: 't1' },
      clientOpId: 'same',
    });
    enqueueOp('u1', {
      entity: 'task',
      action: 'update',
      payload: { id: 't1', text: 'x' },
      clientOpId: 'same',
    });
    expect(listPendingOps('u1')).toHaveLength(1);
  });

  it('marks done', () => {
    const op = enqueueOp('u1', {
      entity: 'task',
      action: 'upsert',
      payload: { id: 't2', text: 'A' },
      clientOpId: makeClientOpId(),
    });
    markOpDone('u1', op.id);
    expect(listPendingOps('u1')).toHaveLength(0);
    expect(loadQueue('u1').find((o) => o.id === op.id)?.status).toBe('done');
  });

  it('marks failed', () => {
    const op = enqueueOp('u1', {
      entity: 'meeting',
      action: 'update',
      payload: { id: 'm1' },
    });
    markOpFailed('u1', op.id, 'network');
    expect(listPendingOps('u1')[0]?.status).toBe('failed');
  });
});
