import { describe, expect, it } from 'vitest';
import { reconcileTravelDayRows } from '@/lib/travel/travelOffline';
import type { SyncOp } from '@/lib/offline/types';

function op(args: Partial<SyncOp> & Pick<SyncOp, 'action' | 'entityId' | 'payload'>): SyncOp {
  return {
    id: 'op-1', clientOpId: 'client-1', userId: 'u1', entity: 'travel',
    createdAt: '2026-10-18T00:00:00.000Z', attempts: 0, lastError: null, status: 'pending',
    ...args,
  };
}

describe('reconcileTravelDayRows', () => {
  it('applies queued creates and updates over a remote snapshot without duplicating IDs', () => {
    const remote = [
      { id: 'a', trip_day_id: 'day-1', text: 'Existing', order_index: 0, status: 'pending' },
    ];
    const cached = [
      { id: 'b', trip_day_id: 'day-1', text: 'New stop', order_index: 1, status: 'pending' },
    ];
    const pending = [
      op({ action: 'upsert', entityId: 'b', payload: { id: 'b', trip_day_id: 'day-1', text: 'New stop', order_index: 1, status: 'pending' } }),
      op({ id: 'op-2', clientOpId: 'client-2', action: 'update', entityId: 'a', payload: { id: 'a', text: 'Edited', order_index: 0 }, createdAt: '2026-10-18T00:00:01.000Z' }),
    ];
    const result = reconcileTravelDayRows('day-1', remote, cached, pending);
    expect(result.map((row) => row.id)).toEqual(['a', 'b']);
    expect(result[0].text).toBe('Edited');
  });

  it('removes a queued moved stop from its old day and includes it on its new day', () => {
    const cached = [{ id: 'a', trip_day_id: 'day-1', text: 'Moved', order_index: 0, status: 'pending' }];
    const move = op({ action: 'update', entityId: 'a', payload: { id: 'a', trip_day_id: 'day-2', order_index: 2 } });
    expect(reconcileTravelDayRows('day-1', cached, cached, [move])).toEqual([]);
    expect(reconcileTravelDayRows('day-2', [], cached, [move])).toEqual([
      { id: 'a', trip_day_id: 'day-2', text: 'Moved', order_index: 2, status: 'pending' },
    ]);
  });

  it('does not reintroduce a locally completed stop from a stale remote read', () => {
    const remote = [{ id: 'a', trip_day_id: 'day-1', text: 'Done', order_index: 0, status: 'pending' }];
    const completed = op({ action: 'update', entityId: 'a', payload: { id: 'a', status: 'done' } });
    expect(reconcileTravelDayRows('day-1', remote, remote, [completed])).toEqual([]);
  });
});
