'use client';

import { useEffect, useState } from 'react';

/** One-second clock for live remaining time and the day rail. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);
  return now;
}
