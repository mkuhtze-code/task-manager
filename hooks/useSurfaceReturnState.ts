'use client';

import { useEffect, useRef } from 'react';
import { loadLensState, saveLensState } from '@/lib/nav/returnState';

type PendingWrite = {
  key: string;
  timer: number;
};

/**
 * Preserve a surface's small, non-sensitive view state and scroll position
 * across client-side navigation. Data and drafts remain owned by their normal
 * stores; this hook only restores presentation state after the surface is ready.
 */
export function useSurfaceReturnState<T>(
  key: string | null,
  state: T,
  restoreState: (state: T) => void,
  ready: boolean,
) {
  const stateRef = useRef(state);
  const restoreRef = useRef(restoreState);
  const restoredKeyRef = useRef<string | null>(null);
  const pendingWriteRef = useRef<PendingWrite | null>(null);

  stateRef.current = state;
  restoreRef.current = restoreState;

  useEffect(() => {
    if (!key || !ready || restoredKeyRef.current === key) return;

    const snapshot = loadLensState<T>(key);
    if (!snapshot) {
      restoredKeyRef.current = key;
      return;
    }

    restoreRef.current(snapshot.state);

    // Mark restored only after the frame executes so Strict Mode's simulated
    // effect cleanup can cancel and safely reschedule this work.
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, snapshot.scrollY);
      restoredKeyRef.current = key;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [key, ready]);

  useEffect(() => {
    const pending = pendingWriteRef.current;
    // React Strict Mode immediately re-runs effects after a simulated cleanup.
    // Cancel only that same-key write; a real account-key change still saves
    // the previous account's state under its own key.
    if (pending && pending.key === key) {
      window.clearTimeout(pending.timer);
      pendingWriteRef.current = null;
    }
    if (!key) return;

    return () => {
      const snapshotState = stateRef.current;
      const scrollY = Math.max(0, window.scrollY || 0);
      const timer = window.setTimeout(() => {
        saveLensState(key, snapshotState, scrollY);
        if (pendingWriteRef.current?.timer === timer) {
          pendingWriteRef.current = null;
        }
      }, 0);
      pendingWriteRef.current = { key, timer };
    };
  }, [key]);
}
