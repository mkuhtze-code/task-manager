'use client';

import { useEffect, useState } from 'react';

/**
 * Clock for live remaining time and the day rail.
 *
 * Default 5s — was 1s and forced the whole Today surface to re-render
 * every second. Pass 1000 when an active timer needs second-level precision.
 */
export function useNow(intervalMs = 5000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);
  return now;
}
