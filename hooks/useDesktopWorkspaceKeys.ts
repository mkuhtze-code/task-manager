'use client';

import { useEffect } from 'react';

/**
 * Desktop workspace keyboard:
 * - Escape closes the open detail pane
 * - ArrowUp / ArrowDown (or k / j) moves selection in the ordered list
 */
export function useDesktopWorkspaceKeys(opts: {
  enabled: boolean;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  orderedIds: string[];
}) {
  const { enabled, openId, setOpenId, orderedIds } = opts;

  useEffect(() => {
    if (!enabled) return;

    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) {
          if (e.key === 'Escape') {
            (t as HTMLElement).blur();
          } else {
            return;
          }
        }
      }

      if (e.key === 'Escape') {
        if (openId) {
          e.preventDefault();
          setOpenId(null);
        }
        return;
      }

      const down = e.key === 'ArrowDown' || e.key === 'j';
      const up = e.key === 'ArrowUp' || e.key === 'k';
      if (!down && !up) return;
      if (orderedIds.length === 0) return;

      e.preventDefault();
      const idx = openId ? orderedIds.indexOf(openId) : -1;
      if (down) {
        const next = idx < 0 ? 0 : Math.min(idx + 1, orderedIds.length - 1);
        setOpenId(orderedIds[next]);
      } else {
        const next = idx < 0 ? orderedIds.length - 1 : Math.max(idx - 1, 0);
        setOpenId(orderedIds[next]);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, openId, setOpenId, orderedIds]);
}
