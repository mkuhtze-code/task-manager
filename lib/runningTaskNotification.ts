import { Capacitor, registerPlugin } from '@capacitor/core';

interface RunningTaskNotificationPlugin {
  showRunningTask(options: { taskName: string; startedAt: number }): Promise<{ ok: boolean }>;
  dismissRunningTask(): Promise<{ ok: boolean }>;
}

const RunningTaskNotification = registerPlugin<RunningTaskNotificationPlugin>('RunningTaskNotification');

export async function showRunningTaskNotification(taskName: string, startedAt: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await RunningTaskNotification.showRunningTask({
      taskName,
      startedAt: new Date(startedAt).getTime(),
    });
  } catch (e) {
    console.error('[RunningTask] show error:', e);
  }
}

export async function dismissRunningTaskNotification(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await RunningTaskNotification.dismissRunningTask();
  } catch (e) {
    console.error('[RunningTask] dismiss error:', e);
  }
}
