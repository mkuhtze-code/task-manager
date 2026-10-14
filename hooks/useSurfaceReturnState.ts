'use client';

import { useEffect, useRef } from 'react';

type PersistedSurfaceState<T> = {
  version: 1;
  state: T;
  scrollY: number;
};

function readSnapshot<T>(key: string): PersistedSurfaceState<T> | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PersistedSurfaceState<T>>;
    if (
      value.version !== 1 ||
      value.state == null ||
      typeof value.scrollY !== 'number' ||
      !Number.isFinite(value.scrollY) ||
      value.scrollY < 0
    ) {
      return null;
    }
    return value as PersistedSurfaceState<T>;
  } catch {
    return null;
  }
}

/**
 * Preserve a surface's small, non-sensitive view state and scroll position
 * across client-side navigation. Data and drafts remain owned by their normal
 * stores; this hook only restores presentation state after the surface is ready.
 */
export function useSurfaceReturnState<T>(
  key: string,
  state: T,
  restoreState: (state: T) => void,
  ready: boolean,
) {
  const stateRef = useRef(state);
  const restoreRef = useRef(restoreState);
  const restoredRef = useRef(false);

  stateRef.current = state;
  restoreRef.current = restoreState;

  useEffect(() => {
    if (!ready || restoredRef.current) return;
    restoredRef.current = true;

    const snapshot = readSnapshot<T>(key);
    if (!snapshot) return;

    restoreRef.current(snapshot.state);

    // Wait for the restored state to render before putting the viewport back.
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, snapshot.scrollY);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [key, ready]);

  useEffect(() => {
    return () => {
      try {
        const snapshot: PersistedSurfaceState<T> = {
          version: 1,
          state: stateRef.current,
          scrollY: Math.max(0, window.scrollY || 0),
        };
        window.sessionStorage.setItem(key, JSON.stringify(snapshot));
      } catch {
        // State restoration is best-effort; storage restrictions must not block navigation.
      }
    };
  }, [key]);
}
