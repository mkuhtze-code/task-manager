
'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * WCAG 2 AA helpers for modal sheets:
 * - Escape closes
 * - Initial focus moves into the dialog
 * - Tab cycles within the dialog
 * - Focus returns to the previous element on close
 *
 * Keeps behaviour quiet: no extra UI, only access.
 */
export function useDialogA11y(onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    const node = containerRef.current;
    if (!node) return;

    const getFocusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
      );

    const focusable = getFocusable();
    const initial =
      node.querySelector<HTMLElement>('[data-autofocus]') || focusable[0] || null;
    requestAnimationFrame(() => initial?.focus());

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = getFocusable();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const i = active ? list.indexOf(active) : -1;
      if (e.shiftKey) {
        if (i <= 0) {
          e.preventDefault();
          list[list.length - 1]?.focus();
        }
      } else if (i === list.length - 1 || i === -1) {
        e.preventDefault();
        list[0]?.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const prev = previousFocus.current;
      if (prev && typeof prev.focus === 'function') {
        requestAnimationFrame(() => prev.focus());
      }
    };
  }, [onClose]);

  return containerRef;
}
