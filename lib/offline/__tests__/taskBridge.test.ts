import { beforeEach, describe, expect, it } from 'vitest';
import type { Task } from '@/lib/taskTypes';
import { loadCachedOpenTasks, cacheOpenTasks, localPatchTask, localRemoveTask, localUpsertTask } from '../taskBridge';

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

const baseTask = (id: string, text: string): Task => ({
  id,
  text,
  status: 'pending',
  source: 'came_up',
  estimate_mins: 15,
  logged_mins: 0,
  started_at: null,
  due_today: false,
  order_index: 0,
  created_at: '2026-10-11T08:00:00.000Z',
  surface_date: null,
  intended_time: null,
  location_text: null,
  lat: null,
  lng: null,
  requires_visit: null,
  drive_mins_to_next: 0,
  route_polyline: null,
  info: '',
  job_id: null,
  original_input: null,
});

describe('offline task bridge reconciliation', () => {
  beforeEach(installStorage);

  it('keeps an unsynced local edit when a stale remote snapshot arrives', () => {
    const original = baseTask('task-1', 'Original');
    cacheOpenTasks('user-1', [original]);
    localPatchTask('user-1', 'task-1', { text: 'Edited offline' });

    cacheOpenTasks('user-1', [original]);

    expect(loadCachedOpenTasks('user-1').tasks[0]?.text).toBe('Edited offline');
  });

  it('keeps an offline deletion removed from a subsequent remote snapshot', () => {
    const original = baseTask('task-2', 'Delete me');
    cacheOpenTasks('user-1', [original]);
    localRemoveTask('user-1', 'task-2');

    cacheOpenTasks('user-1', [original]);

    expect(loadCachedOpenTasks('user-1').tasks).toEqual([]);
  });

  it('preserves a locally captured task across refresh until it syncs', () => {
    const created = baseTask('task-3', 'Captured offline');
    localUpsertTask('user-1', created);

    cacheOpenTasks('user-1', []);

    expect(loadCachedOpenTasks('user-1').tasks).toEqual([created]);
  });
});
