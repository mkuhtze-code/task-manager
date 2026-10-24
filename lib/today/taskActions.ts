import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Task, SortMode, Subtask } from '@/lib/taskTypes';
import type { HistoricalTask } from '@/lib/taskIntelligence';
import { buildClusters } from '@/lib/taskIntelligence';
import { isStarterTask } from '@/lib/starterPack';
import { closeCompletionLoop, historyRowFromCompletion } from '@/lib/thinking/evidence/closeCompletionLoop';
import { loadActiveRequestLocal, loadWorkingMemoryLocal, saveActiveRequestLocal, saveWorkingMemoryLocal, pushEngineStateRemote } from '@/lib/engine/persist';
import { releaseCompletedTaskContext } from '@/lib/engine/taskLifecycle';
import { notifyTaskActivity } from '@/hooks/useActiveTask';
import { showActiveTimerNotification } from '@/lib/activeTimerNotify';
import { parseMins } from '@/lib/timeFormat';
import type { PostStopPromptState } from '@/components/PostStopPrompt';

type TodayTaskActionsDependencies = {
  supabase: typeof import('@/lib/supabaseClient').supabase;
  session: Session | null;
  tasks: Task[];
  tasksRef: MutableRefObject<Task[]>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  onDayModelChanged?: () => void;
  sortMode: SortMode;
  recalcRoute: () => Promise<void>;
  queueTaskPatch: (id: string, patch: Partial<Task>) => boolean;
  queueTaskDelete: (id: string) => boolean;
  history: HistoricalTask[];
  setHistory: Dispatch<SetStateAction<HistoricalTask[]>>;
  clusters: ReturnType<typeof buildClusters>;
  subtasksByTask: Record<string, Subtask[]>;
  postStopPrompt: PostStopPromptState | null;
  setPostStopPrompt: Dispatch<SetStateAction<PostStopPromptState | null>>;
  setPostStopBusy: Dispatch<SetStateAction<boolean>>;
  subDraftText: Record<string, string>;
  setSubDraftText: Dispatch<SetStateAction<Record<string, string>>>;
  subDraftTime: Record<string, string>;
  setSubDraftTime: Dispatch<SetStateAction<Record<string, string>>>;
  setSubtasksByTask: Dispatch<SetStateAction<Record<string, Subtask[]>>>;
};

/** Existing Today task lifecycle and metadata actions, moved without changing their rules. */
export function createTodayTaskActions(deps: TodayTaskActionsDependencies) {
  const {
    supabase, session, tasks, tasksRef, setTasks,
    onDayModelChanged = () => {}, sortMode, recalcRoute,
    queueTaskPatch, queueTaskDelete, history, setHistory, clusters,
    subtasksByTask, postStopPrompt, setPostStopPrompt, setPostStopBusy,
    subDraftText, setSubDraftText, subDraftTime, setSubDraftTime,
    setSubtasksByTask,
  } = deps;

  async function updateTask(
    id: string,
    text: string,
    mins: number,
    surfaceDate: string | null,
    locationText: string | null,
    lat: number | null,
    lng: number | null,
    requiresVisit?: boolean | null
  ): Promise<boolean> {
    const payload: Partial<Task> = {
      text,
      estimate_mins: mins,
      surface_date: surfaceDate,
      location_text: locationText,
      lat,
      lng,
    };
    if (requiresVisit !== undefined) {
      payload.requires_visit = requiresVisit;
    }
    if (!queueTaskPatch(id, payload)) {
      const { error } = await supabase.from('tasks').update(payload).eq('id', id);
      if (error) {
        console.error('[task-detail] save failed', { taskId: id, message: error.message });
        return false;
      }
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              text,
              estimate_mins: mins,
              surface_date: surfaceDate,
              location_text: locationText,
              lat,
              lng,
              requires_visit:
                requiresVisit !== undefined ? requiresVisit : t.requires_visit,
            }
          : t
      )
    );
    onDayModelChanged();
    if (sortMode === 'geo_aware') recalcRoute();
    return true;
  }

  async function setRouteIntent(id: string, requiresVisit: boolean | null) {
    const previous = tasksRef.current.find((t) => t.id === id)?.requires_visit ?? null;
    tasksRef.current = tasksRef.current.map((t) =>
      t.id === id ? { ...t, requires_visit: requiresVisit } : t
    );
    setTasks(tasksRef.current);
    if (sortMode === 'geo_aware') void recalcRoute();

    if (queueTaskPatch(id, { requires_visit: requiresVisit })) return;

    const { error } = await supabase
      .from('tasks')
      .update({ requires_visit: requiresVisit })
      .eq('id', id);
    if (error) {
      console.error(error);
      tasksRef.current = tasksRef.current.map((t) =>
        t.id === id ? { ...t, requires_visit: previous } : t
      );
      setTasks(tasksRef.current);
      if (sortMode === 'geo_aware') void recalcRoute();
      const msg = String((error as { message?: string }).message || error);
      alert(
        /requires_visit|PGRST204|schema cache/i.test(msg)
          ? 'Travel preference needs the requires_visit column. Run 20260930_task_requires_visit.sql in Supabase, then try again.'
          : 'Could not save travel preference: ' + msg
      );
    }
  }

  // Freeform information ("what I'd write underneath this task on paper").
  // A dedicated narrow write path so it never touches the other fields —
  // saving info mid-capture must never clobber a text/time edit that is
  // mid-blur elsewhere.
  async function saveTaskInfo(id: string, info: string) {
    if (!queueTaskPatch(id, { info })) {
      const { error } = await supabase.from('tasks').update({ info }).eq('id', id);
      if (error) {
        console.error(error);
        alert('Could not save the information: ' + error.message);
        return;
      }
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, info } : t)));
  }

  // Assigning a Task to a Job (or moving it between Jobs, or detaching it)
  // never changes the Task itself or Today's scheduling — a Job is a lens,
  // not a constraint. The Task stays exactly where Today would show it.
  async function moveTaskToJob(id: string, jobId: string | null) {
    if (!queueTaskPatch(id, { job_id: jobId })) {
      const { error } = await supabase.from('tasks').update({ job_id: jobId }).eq('id', id);
      if (error) {
        console.error(error);
        alert('Could not move the task: ' + error.message);
        return;
      }
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, job_id: jobId } : t)));
  }

  async function toggleDueToday(id: string, current: boolean) {
    const due_today = !current;
    if (!queueTaskPatch(id, { due_today })) {
      const { error } = await supabase.from('tasks').update({ due_today }).eq('id', id);
      if (error) {
        console.error(error);
        alert('Could not update the task: ' + error.message);
        return;
      }
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, due_today } : t)));
  }

  async function startTask(id: string) {
    const alreadyActive = tasks.find((t) => t.status === 'active');
    if (alreadyActive) return;
    const task = tasks.find((t) => t.id === id);
    const startedAt = new Date().toISOString();
    const patch: Partial<Task> = {
      status: 'active',
      started_at: startedAt,
      near_notified: false,
      over_notified: false,
      last_overdue_ping_at: null,
    };
    if (!queueTaskPatch(id, patch)) {
      const { error } = await supabase.from('tasks').update(patch).eq('id', id);
      if (error) {
        console.error(error);
        alert('Could not start the task: ' + error.message);
        return;
      }
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    onDayModelChanged();
    if (task) {
      void showActiveTimerNotification({
        taskId: id,
        text: task.text,
        startedAt,
        estimateMins: task.estimate_mins || 0,
        loggedMins: task.logged_mins || 0,
        urgent: true,
      });
    }
    notifyTaskActivity({
      type: 'started',
      taskId: id,
      text: task?.text,
      startedAt,
      estimateMins: task?.estimate_mins || 0,
      loggedMins: task?.logged_mins || 0,
    });
  }

  async function stopTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task || !task.started_at) return;
    const sessionMins = (Date.now() - new Date(task.started_at).getTime()) / 60000;
    const newLogged = task.logged_mins + sessionMins;
    const patch: Partial<Task> = { status: 'pending', started_at: null, logged_mins: newLogged };
    if (!queueTaskPatch(id, patch)) {
      const { error } = await supabase.from('tasks').update(patch).eq('id', id);
      if (error) {
        console.error(error);
        alert('Could not stop the task: ' + error.message);
        return;
      }
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    onDayModelChanged();
    notifyTaskActivity({
      type: 'stopped',
      taskId: id,
      logged_mins: newLogged,
      text: task.text,
    });
  }

  async function completeTask(id: string): Promise<boolean> {
    const task = tasks.find((t) => t.id === id);
    if (!task) return false;
    let finalLogged = task.logged_mins;
    if (task && task.status === 'active' && task.started_at) {
      finalLogged += (Date.now() - new Date(task.started_at).getTime()) / 60000;
    }
    const measured = Math.round(finalLogged);
    const skipLearn = task ? isStarterTask(task) : false;
    const loop = skipLearn
      ? { actualForDb: 0, trainMins: null as number | null, source: 'none' as const }
      : closeCompletionLoop({
          userId: session?.user?.id,
          taskId: task.id,
          taskText: task.text,
          estimateMins: task.estimate_mins || 0,
          measuredMins: measured,
          history,
          clusters,
          outcomeKind: 'done',
          realityOutcome: 'done',
          startedAt: task.started_at ?? null,
          activeMinutes: measured > 0 ? measured : null,
          hints: {
            estimateMins: task.estimate_mins,
            loggedMins: measured,
            jobId: task.job_id,
            dueToday: task.due_today,
            intendedTime: task.intended_time,
            createdAt: task.created_at,
            surfaceDate: task.surface_date,
            subtaskCount: subtasksByTask[task.id]?.length ?? 0,
          },
        });
    const actualForDb = loop.actualForDb;
    const completionPatch: Partial<Task> = {
      status: 'done',
      started_at: null,
      logged_mins: finalLogged,
      actual_mins: actualForDb > 0 ? actualForDb : null,
      completed_at: new Date().toISOString(),
    };
    if (!queueTaskPatch(id, completionPatch)) {
      const { error } = await supabase.from('tasks').update(completionPatch).eq('id', id);
      if (error) {
        console.error(error);
        alert('Could not complete the task: ' + error.message);
        return false;
      }
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    onDayModelChanged();

    // Completion closes the task's refinement chain. Keep historical memory,
    // but do not let the next standalone capture inherit this completed task.
    const completedUserId = session?.user?.id;
    if (completedUserId) {
      const activeRequest = loadActiveRequestLocal(completedUserId);
      const workingMemory = loadWorkingMemoryLocal(completedUserId);
      const released = releaseCompletedTaskContext(id, activeRequest, workingMemory);
      if (released.cleared) {
        saveActiveRequestLocal(null, completedUserId);
        saveWorkingMemoryLocal(released.workingMemory, completedUserId);
        void pushEngineStateRemote(
          supabase as never,
          completedUserId,
          released.workingMemory,
          null,
          [],
        );
      }
    }

    if (task && loop.trainMins != null) {
      setHistory((prev) => [
        historyRowFromCompletion(task, loop.trainMins!, measured, {
          subtask_count: subtasksByTask[task.id]?.length ?? 0,
        }),
        ...prev,
      ]);
    }
    if (task?.lat != null && sortMode === 'geo_aware') recalcRoute();
    notifyTaskActivity({ type: 'completed', taskId: id });
    return true;
  }

  async function confirmPostStopDone() {
    if (!postStopPrompt) return;
    setPostStopBusy(true);
    try {
      const completed = await completeTask(postStopPrompt.taskId);
      if (completed) setPostStopPrompt(null);
    } finally {
      setPostStopBusy(false);
    }
  }

  function dismissPostStopPrompt() {
    setPostStopPrompt(null);
  }

  async function deleteTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!queueTaskDelete(id)) {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) {
        console.error(error);
        alert('Could not delete the task: ' + error.message);
        return;
      }
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    onDayModelChanged();
    if (task?.lat != null && sortMode === 'geo_aware') recalcRoute();
  }

  async function addSubtask(taskId: string) {
    if (!session?.user?.id) return;
    const text = (subDraftText[taskId] || '').trim();
    if (text.length === 0) return;
    const mins = parseMins(subDraftTime[taskId] || '') || 0;
    const userId = session.user.id;
    const existing = subtasksByTask[taskId] || [];
    const { data, error } = await supabase
      .from('subtasks')
      .insert({ user_id: userId, task_id: taskId, text, mins, order_index: existing.length })
      .select()
      .single();
    if (error) {
      console.error(error);
      alert('Could not add the subtask: ' + error.message);
      return;
    }
    if (data) {
      setSubtasksByTask((prev) => ({ ...prev, [taskId]: [...(prev[taskId] || []), data] }));
    }
    setSubDraftText((prev) => ({ ...prev, [taskId]: '' }));
    setSubDraftTime((prev) => ({ ...prev, [taskId]: '' }));
  }

  async function toggleSubtaskDone(subtaskId: string, taskId: string, current: boolean) {
    const { error } = await supabase.from('subtasks').update({ done: !current }).eq('id', subtaskId);
    if (error) {
      console.error(error);
      alert('Could not update the subtask: ' + error.message);
      return;
    }
    setSubtasksByTask((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] || []).map((s) => (s.id === subtaskId ? { ...s, done: !current } : s)),
    }));
  }

  async function deleteSubtask(subtaskId: string, taskId: string) {
    const { error } = await supabase.from('subtasks').delete().eq('id', subtaskId);
    if (error) {
      console.error(error);
      alert('Could not delete the subtask: ' + error.message);
      return;
    }
    setSubtasksByTask((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] || []).filter((s) => s.id !== subtaskId),
    }));
  }
  return {
    updateTask,
    setRouteIntent,
    saveTaskInfo,
    moveTaskToJob,
    toggleDueToday,
    startTask,
    stopTask,
    completeTask,
    confirmPostStopDone,
    dismissPostStopPrompt,
    deleteTask,
    addSubtask,
    toggleSubtaskDone,
    deleteSubtask,
  };
}
