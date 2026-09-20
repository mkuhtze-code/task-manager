'use client';

export type TimerNotifyPayload = {
  taskId: string;
  text: string;
  startedAt: string;
  estimateMins: number;
  loggedMins: number;
};

const TIMER_TAG = 'dokkit-active-timer';

function fmtMins(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

function elapsedMins(payload: TimerNotifyPayload): number {
  const started = new Date(payload.startedAt).getTime();
  const session = (Date.now() - started) / 60000;
  return (payload.loggedMins || 0) + Math.max(0, session);
}

function buildBody(payload: TimerNotifyPayload): string {
  const elapsed = elapsedMins(payload);
  const estimate = payload.estimateMins || 0;
  if (estimate > 0) {
    if (elapsed > estimate) {
      return `${fmtMins(elapsed)} elapsed · over by ${fmtMins(elapsed - estimate)}`;
    }
    return `${fmtMins(elapsed)} elapsed · ${fmtMins(estimate - elapsed)} left`;
  }
  return `${fmtMins(elapsed)} elapsed`;
}

/**
 * Show the ongoing timer notification.
 * Uses ServiceWorkerRegistration.showNotification from the page (reliable)
 * and also posts to the SW so background ticks can refresh the same tag.
 */
export async function showActiveTimerNotification(
  payload: TimerNotifyPayload
): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;

  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      console.warn('[dokkit-timer] Notification permission not granted');
      return;
    }

    if (!('serviceWorker' in navigator)) {
      new Notification(payload.text || 'Dokkit timer', {
        body: buildBody(payload),
        tag: TIMER_TAG,
        silent: true,
      });
      return;
    }

    const reg = await navigator.serviceWorker.ready;

    await reg.showNotification(payload.text || 'Dokkit timer', {
      body: buildBody(payload),
      icon: '/app/favicon-192.png',
      badge: '/app/favicon-192.png',
      tag: TIMER_TAG,
      renotify: false,
      requireInteraction: true,
      silent: true,
      data: {
        type: 'active_timer',
        taskId: payload.taskId,
        startedAt: payload.startedAt,
        estimateMins: payload.estimateMins,
        loggedMins: payload.loggedMins,
        text: payload.text,
        destination: '/app',
      },
      actions: [
        { action: 'stop', title: 'Stop' },
        { action: 'open', title: 'Open' },
      ],
    });

    const worker = reg.active;
    if (worker) {
      worker.postMessage({ type: 'TIMER_SHOW', ...payload });
    }
  } catch (err) {
    console.error('[dokkit-timer] show failed', err);
  }
}

export async function clearActiveTimerNotification(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const list = await reg.getNotifications({ tag: TIMER_TAG });
      list.forEach((n) => n.close());
      const worker = reg.active;
      if (worker) worker.postMessage({ type: 'TIMER_CLEAR' });
    }
  } catch (err) {
    console.error('[dokkit-timer] clear failed', err);
  }
}
