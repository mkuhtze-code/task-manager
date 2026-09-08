export interface UtcDayBounds {
  startUtc: Date;
  endUtc: Date;
}

const FALLBACK_TIME_ZONE = 'UTC';

function isUtcZone(timeZone: string | null | undefined): boolean {
  if (!timeZone) {
    return true;
  }
  const z = timeZone.trim();
  return z === 'UTC' || /^Etc\/UTC$/i.test(z) || /^Universal$/i.test(z);
}

function stripFraction(s: string): string {
  const dot = s.indexOf('.');
  return dot >= 0 ? s.slice(0, dot) : s;
}

function offsetMsAt(timeZone: string, at: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = fmt.formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = p.value;
    }
  }
  const hour = Number(map.hour) % 24;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - at.getTime();
}

export function zonedToUtc(
  wallClock: string | null | undefined,
  timeZone: string | null | undefined,
  fallbackZone = FALLBACK_TIME_ZONE
): Date {
  if (!wallClock) {
    throw new Error('Missing event wall-clock time');
  }
  if (wallClock.endsWith('Z') || /\+[0-9]{2}:[0-9]{2}$/.test(wallClock)) {
    return new Date(wallClock);
  }
  if (isUtcZone(timeZone)) {
    const parsed = Date.parse(stripFraction(wallClock) + 'Z');
    if (Number.isNaN(parsed)) {
      throw new Error(`Unparseable event time: ${wallClock}`);
    }
    return new Date(parsed);
  }
  const zone = (timeZone ?? fallbackZone).trim();
  const wall = Date.parse(stripFraction(wallClock) + 'Z');
  if (Number.isNaN(wall)) {
    throw new Error(`Unparseable event time: ${wallClock}`);
  }
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const off = offsetMsAt(zone, new Date(guess));
    const next = wall - off;
    if (next === guess) {
      break;
    }
    guess = next;
  }
  return new Date(guess);
}

export function localDayBounds(
  dateOnly: string | null | undefined,
  timeZone: string | null | undefined,
  fallbackZone = FALLBACK_TIME_ZONE
): UtcDayBounds {
  if (!dateOnly || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new Error(`Expected YYYY-MM-DD, got: ${dateOnly}`);
  }
  const [y, m, d] = dateOnly.split('-').map(Number);
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1))
    .toISOString()
    .slice(0, 10);
  const startUtc = zonedToUtc(`${dateOnly}T00:00:00`, timeZone, fallbackZone);
  const endUtc = zonedToUtc(`${nextDay}T00:00:00`, timeZone, fallbackZone);
  return { startUtc, endUtc };
}