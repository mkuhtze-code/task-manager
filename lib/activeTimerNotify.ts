'use client';

export type TimerNotifyPayload = {
  taskId: string;
  text: string;
  startedAt: string;
  estimateMins: number;
  loggedMins: number;
  /** First show after Start — use sound so the user can confirm it appeared. */
  urgent?: boolean;
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

function iconUrls(): { icon: string; badge: string } {
  if (typeof window === 'undefined') {
    return { icon: '/app/favicon-192.png', badge: '/app/favicon-192.png' };
  }
  const base = window.location.origin;
  return {
    icon: `${base}/app/favicon-192.png`,
    badge: `${base}/app/favicon-192.png`,
  };
}

/** Resolve a registration without hanging forever on .ready */
async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const existing = await navigator.serviceWorker.getRegistration('/app/');
    if (existing?.active) return existing;

    const raced = await Promise.race([
      navigator.serviceWorker.ready.then((r) => r),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    if (raced) return raced;
    return existing || null;
  } catch {
    return null;
  }
}

function pageLevelNotification(
  title: string,
  body: string,
  icon: string,
  silent: boolean
) {
  try {
    // eslint-disable-next-line no-new
    new Notification(title, {
      body,
      tag: TIMER_TAG,
      silent,
      icon,
      requireInteraction: true,
    });
    return true;
  } catch (err) {
    console.error('[dokkit-timer] page Notification failed', err);
    return false;
  }
}

/**
 * Show the ongoing timer notification.
 * Prefer calling this in the same turn as the user tapping Start.
 */
export async function showActiveTimerNotification(
  payload: TimerNotifyPayload
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) {
    console.warn('[dokkit-timer] Notification API missing');
    return false;
  }

  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      console.warn('[dokkit-timer] permission=', permission);
      return false;
    }

    const { icon, badge } = iconUrls();
    const title = (payload.text && String(payload.text).trim()) || 'Dokkit timer';
    const body = buildBody(payload);
    const silent = payload.urgent ? false : true;

    const options: NotificationOptions & {
      actions?: { action: string; title: string }[];
    } = {
      body,
      icon,
      badge,
      tag: TIMER_TAG,
      requireInteraction: true,
      silent,
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
    };

    const reg = await getSwRegistration();
    if (reg) {
      try {
        await reg.showNotification(title, options);
        const worker = reg.active;
        if (worker) {
          worker.postMessage({ type: 'TIMER_SHOW', ...payload });
        }
        console.info('[dokkit-timer] SW notification shown', title);
        return true;
      } catch (err) {
        console.warn('[dokkit-timer] SW show failed, falling back', err);
      }
    }

    // Fallback: page-level notification (works while app is open / just backgrounded)
    const ok = pageLevelNotification(title, body, icon, silent);
    if (ok) console.info('[dokkit-timer] page notification shown', title);
    return ok;
  } catch (err) {
    console.error('[dokkit-timer] show failed', err);
    return false;
  }
}

export async function clearActiveTimerNotification(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const reg = await getSwRegistration();
    if (reg) {
      const list = await reg.getNotifications({ tag: TIMER_TAG });
      list.forEach((n) => n.close());
      const worker = reg.active;
      if (worker) worker.postMessage({ type: 'TIMER_CLEAR' });
    }
  } catch (err) {
    console.error('[dokkit-timer] clear failed', err);
  }
}
