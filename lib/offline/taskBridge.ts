/**
 * Task offline bridge — cache open tasks + enqueue mutations.
 * TodayPage adopts gradually: cache after fetch, fall back offline.
 */

import type { Task } from '@/lib/taskTypes';
import { supabase } from '@/lib/supabaseClient';
import {
  getEntityCache,
  setEntityCache,
  upsertEntityInCache,
  patchEntityInCache,
  removeEntityFromCache,
} from './entityCache';
import { enqueueOp, loadQueue } from './queue';
import { registerSyncHandler } from './syncWorker';
import { makeClientOpId } from './types';
import { isOnline } from './network';

export function cacheOpenTasks(userId: string, tasks: Task[]): void {
  // Reconcile a fresh remote snapshot with unsynced local intent before it
  // reaches the UI. Otherwise a refresh can visually undo offline changes.
  const reconciled = new Map(tasks.map((task) => [task.id, task]));
  const pending = loadQueue(userId)
    .filter((op) => op.entity === 'task' &&
      (op.status === 'pending' || op.status === 'failed' || op.status === 'syncing'))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const op of pending) {
    const id = op.entityId || String(op.payload.id || '');
    if (op.action === 'delete') {
      if (id) reconciled.delete(id);
      continue;
    }
    if (op.action === 'upsert') {
      const payload = { ...op.payload };
      // user_id belongs to the database row, not the client Task view model.
      delete payload.user_id;
      const task = payload as unknown as Task;
      if (task.id) reconciled.set(task.id, { ...reconciled.get(task.id), ...task });
      continue;
    }
    if (op.action === 'update' && id) {
      const prior = reconciled.get(id);
      if (prior) reconciled.set(id, { ...prior, ...op.payload } as Task);
    }
  }
  setEntityCache(userId, 'task', [...reconciled.values()]);
}

export function loadCachedOpenTasks(userId: string): {
  tasks: Task[];
  updatedAt: string | null;
} {
  const { items, updatedAt } = getEntityCache<Task>(userId, 'task');
  return { tasks: items, updatedAt };
}

export function localUpsertTask(
  userId: string,
  task: Task,
  clientOpId?: string
): Task {
  upsertEntityInCache(userId, 'task', task);
  enqueueOp(userId, {
    entity: 'task',
    action: 'upsert',
    entityId: task.id,
    clientOpId: clientOpId || makeClientOpId('task'),
    payload: { ...task, user_id: userId },
  });
  return task;
}

export function localPatchTask(
  userId: string,
  taskId: string,
  patch: Partial<Task>,
  clientOpId?: string
): Task | null {
  const next = patchEntityInCache<Task>(userId, 'task', taskId, patch);
  if (!next) return null;
  enqueueOp(userId, {
    entity: 'task',
    action: 'update',
    entityId: taskId,
    clientOpId: clientOpId || makeClientOpId('task'),
    payload: { id: taskId, ...patch },
  });
  return next;
}

export function localRemoveTask(
  userId: string,
  taskId: string,
  clientOpId?: string
): void {
  removeEntityFromCache(userId, 'task', taskId);
  enqueueOp(userId, {
    entity: 'task',
    action: 'delete',
    entityId: taskId,
    clientOpId: clientOpId || makeClientOpId('task'),
    payload: { id: taskId },
  });
}

export function registerTaskSyncHandler(): void {
  registerSyncHandler('task', async (op) => {
    if (!isOnline()) throw new Error('Offline');
    if (op.action === 'upsert') {
      const { error } = await supabase.from('tasks').upsert(op.payload);
      if (error) throw error;
      return;
    }
    if (op.action === 'update') {
      const { id, ...rest } = op.payload as { id: string } & Record<string, unknown>;
      if (!id) throw new Error('Task update missing id');
      const { error } = await supabase.from('tasks').update(rest).eq('id', id).eq('user_id', op.userId);
      if (error) throw error;
      return;
    }
    if (op.action === 'delete') {
      const id = (op.payload as { id?: string }).id || op.entityId;
      if (!id) throw new Error('Task delete missing id');
      const { error } = await supabase.from('tasks').delete().eq('id', id).eq('user_id', op.userId);
      if (error) throw error;
    }
  });
}
