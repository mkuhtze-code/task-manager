export const CALENDAR_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Background syncs are rate-limited to avoid repeatedly querying Microsoft
 * Graph. Explicit user actions and the first OAuth sync may bypass this guard.
 */
export function shouldSkipCalendarSync(
  lastSyncAt: string | null,
  nowMs = Date.now(),
  force = false,
): boolean {
  if (force || !lastSyncAt) return false;

  const lastSyncMs = Date.parse(lastSyncAt);
  if (!Number.isFinite(lastSyncMs)) return false;

  return nowMs - lastSyncMs < CALENDAR_SYNC_MIN_INTERVAL_MS;
}
