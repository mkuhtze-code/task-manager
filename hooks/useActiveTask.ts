'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  clearActiveTimerNotification,
  showActiveTimerNotification,
} from '@/lib/activeTimerNotify';

export type ActiveTaskSnapshot = {
  id: string;
  text: string;
  estimate_mins: number;
  logged_mins: number;
  started_at: string;
  user_id: string;
};

function liveLogged(task: ActiveTaskSnapshot, nowMs: number): number {
  const session = (nowMs - new Date(task.started_at).getTime()) / 60000;
  return (task.logged_mins || 0) + Math.max(0, session);
}

function pushNotification(task: ActiveTaskSnapshot) {
  showActiveTimerNotification({
    taskId: task.id,
    text: task.text,
    startedAt: task.started_at,
    estimateMins: task.estimate_mins || 0,
    loggedMins: task.logged_mins || 0,
  });
}

/**
 * Tracks the single active timed task for the signed-in user.
 * Keeps the in-app banner and the OS notification in sync so the timer
 * remains visible after the app is backgrounded or closed (PWA + push).
 */
export function useActiveTask() {
  const [task, setTask] = useState<ActiveTaskSnapshot | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);

  const refresh = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) {
      setTask(null);
      clearActiveTimerNotification();
      return;
    }

    const { data, error } = await supabase
      .from('tasks')
      .select('id, text, estimate_mins, logged_mins, started_at, user_id')
      .eq('user_id', uid)
      .eq('status', 'active')
      .not('started_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('useActiveTask', error);
      return;
    }
    const next = data as ActiveTaskSnapshot | null;
    setTask(next);
    if (next) pushNotification(next);
    else clearActiveTimerNotification();
  }, []);

  useEffect(() => {
    void refresh();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    const onLocal = () => {
      void refresh();
    };
    window.addEventListener('dokkit:task-activity', onLocal);

    const poll = window.setInterval(() => {
      void refresh();
    }, 12_000);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('dokkit:task-activity', onLocal);
      window.clearInterval(poll);
    };
  }, [refresh]);

  useEffect(() => {
    if (!task) {
      clearActiveTimerNotification();
      return;
    }
    setNowMs(Date.now());
    pushNotification(task);

    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    const notif = window.setInterval(() => pushNotification(task), 30_000);

    const onHide = () => {
      if (document.visibilityState === 'hidden') pushNotification(task);
    };
    document.addEventListener('visibilitychange', onHide);

    return () => {
      window.clearInterval(tick);
      window.clearInterval(notif);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [task?.id, task?.started_at, task?.text, task?.estimate_mins, task?.logged_mins]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('stopActive') !== '1') return;
    const taskId = params.get('taskId');
    const url = new URL(window.location.href);
    url.searchParams.delete('stopActive');
    url.searchParams.delete('taskId');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);

    void (async () => {
      await refresh();
      window.dispatchEvent(
        new CustomEvent('dokkit:stop-from-notification', {
          detail: { taskId },
        })
      );
    })();
  }, [refresh]);

  const elapsedMins = task ? liveLogged(task, nowMs) : 0;
  const overEstimate =
    !!task && task.estimate_mins > 0 && elapsedMins > task.estimate_mins;
  const progress =
    task && task.estimate_mins > 0
      ? Math.min(1, elapsedMins / task.estimate_mins)
      : null;

  const stop = useCallback(async () => {
    if (!task || stopping) return;
    setStopping(true);
    try {
      const sessionMins =
        (Date.now() - new Date(task.started_at).getTime()) / 60000;
      const newLogged = (task.logged_mins || 0) + Math.max(0, sessionMins);
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'pending',
          started_at: null,
          logged_mins: newLogged,
        })
        .eq('id', task.id);
      if (error) {
        console.error(error);
        return;
      }
      setTask(null);
      clearActiveTimerNotification();
      window.dispatchEvent(
        new CustomEvent('dokkit:task-activity', {
          detail: { type: 'stopped', taskId: task.id, logged_mins: newLogged },
        })
      );
    } finally {
      setStopping(false);
    }
  }, [task, stopping]);

  useEffect(() => {
    function onStopFromNotif(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      if (detail.taskId && task && detail.taskId !== task.id) return;
      void stop();
    }
    window.addEventListener('dokkit:stop-from-notification', onStopFromNotif);
    return () =>
      window.removeEventListener('dokkit:stop-from-notification', onStopFromNotif);
  }, [stop, task]);

  return {
    task,
    elapsedMins,
    overEstimate,
    progress,
    stopping,
    stop,
    refresh,
  };
}

/** Call after start/stop/complete on Today so the global player stays in sync. */
export function notifyTaskActivity(detail?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('dokkit:task-activity', { detail: detail || {} })
  );
}
