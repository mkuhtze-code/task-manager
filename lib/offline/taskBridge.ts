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
import { enqueueOp } from './queue';
import { registerSyncHandler } from './syncWorker';
import { makeClientOpId } from './types';
import { isOnline } from './network';

export function cacheOpenTasks(userId: string, tasks: Task[]): void {
  setEntityCache(userId, 'task', tasks);
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
      const { error } = await supabase.from('tasks').update(rest).eq('id', id);
      if (error) throw error;
      return;
    }
    if (op.action === 'delete') {
      const id = (op.payload as { id?: string }).id || op.entityId;
      if (!id) throw new Error('Task delete missing id');
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    }
  });
}
