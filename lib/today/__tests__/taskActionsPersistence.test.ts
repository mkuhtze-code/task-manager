import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/lib/taskTypes';
import { createTodayTaskActions } from '@/lib/today/taskActions';

describe('Today task detail persistence result', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false and does not update local task state when fallback persistence fails', async () => {
    const task = {
      id: 'task-1',
      text: 'Original task',
      estimate_mins: 30,
      surface_date: null,
      location_text: null,
      lat: null,
      lng: null,
      requires_visit: null,
      status: 'pending',
      due_today: false,
      job_id: null,
    } as unknown as Task;
    const setTasks = vi.fn();
    const onDayModelChanged = vi.fn();
    const update = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({
        error: { message: 'network unavailable' },
      }),
    }));
    const supabase = {
      from: vi.fn(() => ({ update })),
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const actions = createTodayTaskActions({
      supabase,
      session: null,
      tasks: [task],
      tasksRef: { current: [task] },
      setTasks,
      onDayModelChanged,
      sortMode: 'manual',
      recalcRoute: vi.fn(async () => {}),
      queueTaskPatch: vi.fn(() => false),
      queueTaskDelete: vi.fn(() => false),
      history: [],
      setHistory: vi.fn(),
      clusters: [] as never,
      subtasksByTask: {},
      postStopPrompt: null,
      setPostStopPrompt: vi.fn(),
      setPostStopBusy: vi.fn(),
      subDraftText: {},
      setSubDraftText: vi.fn(),
      subDraftTime: {},
      setSubDraftTime: vi.fn(),
      setSubtasksByTask: vi.fn(),
    } as unknown as Parameters<typeof createTodayTaskActions>[0]);

    const saved = await actions.updateTask(
      'task-1',
      'Updated task',
      45,
      null,
      null,
      null,
      null,
      null,
    );

    expect(saved).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
    expect(setTasks).not.toHaveBeenCalled();
    expect(onDayModelChanged).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });
});
