// Resolves a user's local time from their IANA timezone string, so the
// server (which only ever sees UTC) can reason about "is it after their
// work day ended" without guessing. Returns null if the timezone hasn't
// been captured yet or is unrecognized — callers should treat that as
// "unknown" rather than assuming a default.
export function getUserLocalTime(
  timezone: string | null,
  at: Date = new Date()
): { minutesOfDay: number; dayOfWeek: number } | null {
  if (!timezone) return null;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    const parts = fmt.formatToParts(at);
    const hourRaw = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const weekdayStr = parts.find((p) => p.type === 'weekday')?.value || '';

    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = dayMap[weekdayStr] ?? at.getUTCDay();

    // Some environments report midnight as "24" in 24-hour mode.
    const hour = hourRaw === 24 ? 0 : hourRaw;

    return { minutesOfDay: hour * 60 + minute, dayOfWeek };
  } catch {
    return null; // invalid/unrecognized timezone string
  }
}

export function timeStringToMinutes(t: string): number {
  const [h, m] = t.split(':').map((x) => parseInt(x, 10));
  return h * 60 + (m || 0);
}
