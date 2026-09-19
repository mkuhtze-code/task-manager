'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

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

/**
 * Tracks the single active timed task for the signed-in user.
 * Used by the persistent player so it survives navigation away from Today.
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
    setTask(data as ActiveTaskSnapshot | null);
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
    if (!task) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [task?.id, task?.started_at]);

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
      window.dispatchEvent(
        new CustomEvent('dokkit:task-activity', {
          detail: { type: 'stopped', taskId: task.id, logged_mins: newLogged },
        })
      );
    } finally {
      setStopping(false);
    }
  }, [task, stopping]);

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
