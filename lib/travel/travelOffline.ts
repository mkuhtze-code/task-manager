import { supabase } from '@/lib/supabaseClient';
import { getEntityCache, setEntityCache } from '@/lib/offline/entityCache';
import { enqueueOp, loadQueue } from '@/lib/offline/queue';
import { registerSyncHandler } from '@/lib/offline/syncWorker';
import { makeClientOpId } from '@/lib/offline/types';
import { isOnline } from '@/lib/offline/network';
import type { SyncOp } from '@/lib/offline/types';

export type CachedTravelSnapshot = {
  id: string;
  trip: Record<string, unknown> | null;
  tripDays: Array<Record<string, unknown>>;
  selectedDayId: string | null;
  activitiesByDay: Record<string, Array<Record<string, unknown>>>;
  updatedAt?: string;
};

export function cacheTravelSnapshot(userId: string, snapshot: CachedTravelSnapshot): void {
  const { items } = getEntityCache<CachedTravelSnapshot>(userId, 'travel');
  const next = items.filter((item) => item.id !== snapshot.id);
  next.push({ ...snapshot, updatedAt: new Date().toISOString() });
  setEntityCache(userId, 'travel', next);
}

export function loadCachedTravelSnapshot(userId: string, tripId: string): CachedTravelSnapshot | null {
  const { items } = getEntityCache<CachedTravelSnapshot>(userId, 'travel');
  return items.find((item) => item.id === tripId) ?? null;
}

export function cacheTravelDayActivities(userId: string, tripId: string, dayId: string, activities: Array<Record<string, unknown>>): void {
  const snapshot = loadCachedTravelSnapshot(userId, tripId);
  if (!snapshot) return;
  snapshot.activitiesByDay = { ...snapshot.activitiesByDay, [dayId]: activities };
  snapshot.selectedDayId = dayId;
  cacheTravelSnapshot(userId, snapshot);
}

/** Reconcile a remote day snapshot with queued local intent before rendering it. */
export function reconcileTravelDayRows<T extends Record<string, unknown> & { id: string; trip_day_id: string; order_index?: number; status?: string }>(
  dayId: string,
  remoteRows: T[],
  cachedRows: T[],
  pendingOps: SyncOp[],
): T[] {
  const rows = new Map<string, T>(remoteRows.map((row) => [row.id, row]));
  const cachedById = new Map<string, T>(cachedRows.map((row) => [row.id, row]));
  const pending = pendingOps
    .filter((op) => op.entity === 'travel' && (op.status === 'pending' || op.status === 'failed' || op.status === 'syncing'))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const op of pending) {
    const payload = op.payload;
    const id = String(op.entityId || payload.id || '');
    if (!id) continue;
    const base = rows.get(id) || cachedById.get(id);
    const targetDayId = String(payload.trip_day_id || base?.trip_day_id || '');
    if (targetDayId !== dayId || payload.status === 'done' || op.action === 'delete') {
      rows.delete(id);
      continue;
    }
    if (op.action === 'upsert' || op.action === 'update') {
      const merged = { ...(base || {} as T), ...payload, id, trip_day_id: targetDayId } as T;
      rows.set(id, merged);
    }
  }
  return [...rows.values()].filter((row) => row.status !== 'done').sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
}

export function reconcileCachedTravelDay(userId: string, tripId: string, dayId: string, remoteRows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const snapshot = loadCachedTravelSnapshot(userId, tripId);
  const cachedRows = (snapshot?.activitiesByDay?.[dayId] || []) as Array<Record<string, unknown> & { id: string; trip_day_id: string; order_index?: number; status?: string }>;
  const pending = loadQueue(userId);
  const reconciled = reconcileTravelDayRows(
    dayId,
    remoteRows as Array<Record<string, unknown> & { id: string; trip_day_id: string; order_index?: number; status?: string }>,
    cachedRows,
    pending,
  );
  cacheTravelDayActivities(userId, tripId, dayId, reconciled);
  return reconciled;
}

export function queueTravelMutation(
  userId: string,
  action: 'upsert' | 'update',
  payload: Record<string, unknown>,
  clientOpId = makeClientOpId('travel'),
): string {
  const id = String(payload.id || '');
  if (!id) throw new Error('Travel mutation requires a stable activity id');
  enqueueOp(userId, {
    entity: 'travel',
    action,
    entityId: id,
    clientOpId,
    payload: { ...payload, id, user_id: userId },
  });
  return clientOpId;
}

export function registerTravelSyncHandler(): void {
  registerSyncHandler('travel', async (op) => {
    if (!isOnline()) throw new Error('Offline');
    const payload = { ...op.payload, user_id: op.userId };
    const id = String(payload.id || op.entityId || '');
    if (!id) throw new Error('Travel mutation missing stable activity id');
    if (op.action === 'upsert') {
      const { error } = await supabase.from('activities').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      return;
    }
    if (op.action === 'update') {
      delete payload.id;
      const { error } = await supabase.from('activities').update(payload).eq('id', id).eq('user_id', op.userId);
      if (error) throw error;
      return;
    }
    throw new Error(`Unsupported travel mutation action: ${op.action}`);
  });
}
