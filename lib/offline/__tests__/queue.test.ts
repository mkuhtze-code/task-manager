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


  it('queues a travel create with a stable row id and deduplicates replay by client operation id', () => {
    const payload = { id: 'stable-activity-uuid', trip_day_id: 'day-1', text: 'Visit site', user_id: 'u1' };
    const first = enqueueOp('u1', {
      entity: 'travel',
      action: 'upsert',
      entityId: payload.id,
      payload,
      clientOpId: 'travel-create-once',
    });
    const replay = enqueueOp('u1', {
      entity: 'travel',
      action: 'upsert',
      entityId: payload.id,
      payload,
      clientOpId: 'travel-create-once',
    });
    expect(replay.id).toBe(first.id);
    expect(replay.payload.id).toBe('stable-activity-uuid');
    expect(loadQueue('u1').filter((op) => op.clientOpId === 'travel-create-once')).toHaveLength(1);
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
  it('does not silently drop pending operations when the queue grows past 200', () => {
    for (let i = 0; i < 225; i += 1) {
      enqueueOp('u1', {
        entity: 'task',
        action: 'update',
        entityId: `t${i}`,
        payload: { id: `t${i}`, order_index: i },
        clientOpId: `large-queue-${i}`,
      });
    }
    expect(listPendingOps('u1')).toHaveLength(225);
    expect(loadQueue('u1')).toHaveLength(225);
  });

  it('dedupes a failed operation instead of creating a second mutation', () => {
    const first = enqueueOp('u1', {
      entity: 'task',
      action: 'update',
      entityId: 't1',
      payload: { id: 't1', status: 'done' },
      clientOpId: 'retry-same-op',
    });
    markOpFailed('u1', first.id, 'temporary network error');
    const second = enqueueOp('u1', {
      entity: 'task',
      action: 'update',
      entityId: 't1',
      payload: { id: 't1', status: 'done' },
      clientOpId: 'retry-same-op',
    });
    expect(second.id).toBe(first.id);
    expect(loadQueue('u1').filter((op) => op.clientOpId === 'retry-same-op')).toHaveLength(1);
  });

  it('makes interrupted syncing operations retryable after a reload', () => {
    const op = enqueueOp('u1', {
      entity: 'task',
      action: 'update',
      entityId: 't1',
      payload: { id: 't1', status: 'done' },
      clientOpId: 'interrupted-sync',
    });
    // Simulate the durable state left behind if the tab closes mid-request.
    const stored = loadQueue('u1');
    stored[0].status = 'syncing';
    localStorage.setItem('dokkit.offline.queue.v1:u1', JSON.stringify(stored));
    expect(listPendingOps('u1').map((entry) => entry.id)).toContain(op.id);
  });

});
