'use client';

export type TimerNotifyPayload = {
  taskId: string;
  text: string;
  startedAt: string;
  estimateMins: number;
  loggedMins: number;
};

function postToWorker(message: Record<string, unknown>) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.ready.then((reg) => {
    const worker = reg.active;
    if (worker) worker.postMessage(message);
  });
}

/** Show or refresh the ongoing timer notification (works when app is backgrounded). */
export function showActiveTimerNotification(payload: TimerNotifyPayload) {
  postToWorker({ type: 'TIMER_SHOW', ...payload });
}

/** Clear the ongoing timer notification. */
export function clearActiveTimerNotification() {
  postToWorker({ type: 'TIMER_CLEAR' });
}
