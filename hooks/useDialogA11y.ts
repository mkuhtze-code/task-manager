import { useEffect, useRef } from 'react';

type DialogA11yOptions = {
  /** Modal sheets trap keyboard focus; non-modal desktop panes do not. */
  trapFocus?: boolean;
  /** Allows an always-mounted component to activate its dialog only while visible. */
  active?: boolean;
};

// The topmost active modal owns Escape and Tab. This prevents nested sheets
// from all responding to one key press.
const activeDialogStack: HTMLElement[] = [];

export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  options: DialogA11yOptions = {},
) {
  const dialogRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  const trapFocusRef = useRef(options.trapFocus ?? true);
  const active = options.active ?? true;

  // Keep current callbacks and presentation mode without restarting the dialog lifecycle.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  trapFocusRef.current = options.trapFocus ?? true;

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Capture the element that had focus when the dialog opened.
    const previousFocus = document.activeElement as HTMLElement | null;
    activeDialogStack.push(dialog);

    // Prefer an explicitly designated control. If none is designated, move
    // focus to the modal container without choosing an input on the user's behalf.
    const focusTarget =
      dialog.querySelector<HTMLElement>('[data-autofocus]') ??
      (trapFocusRef.current ? dialog : null);

    if (focusTarget) {
      if (focusTarget === dialog && !dialog.hasAttribute('tabindex')) {
        dialog.setAttribute('tabindex', '-1');
      }
      requestAnimationFrame(() => {
        if (
          document.body.contains(dialog) &&
          !dialog.contains(document.activeElement)
        ) {
          focusTarget.focus();
        }
      });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only the topmost modal may consume Escape or constrain Tab.
      if (activeDialogStack[activeDialogStack.length - 1] !== dialog) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !trapFocusRef.current) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([type="hidden"]):not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), summary:not([tabindex="-1"]), [contenteditable="true"]:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => {
        if (
          element.hasAttribute('hidden') ||
          element.getAttribute('aria-hidden') === 'true' ||
          element.getAttribute('aria-disabled') === 'true' ||
          element.closest('[inert], [aria-hidden="true"]')
        ) {
          return false;
        }
        const closedDetails = element.closest('details:not([open])');
        if (
          closedDetails &&
          !(element.tagName.toLowerCase() === 'summary' && element.parentElement === closedDetails)
        ) {
          return false;
        }
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (!first || !last) {
        event.preventDefault();
        if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
        dialog.focus();
        return;
      }

      const focusIsOutside = !dialog.contains(activeElement);
      if (event.shiftKey && (activeElement === first || focusIsOutside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || focusIsOutside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const stackIndex = activeDialogStack.lastIndexOf(dialog);
      if (stackIndex !== -1) activeDialogStack.splice(stackIndex, 1);

      // Restore focus to the opener or the still-active parent dialog, but
      // never steal focus from a different modal that remains on screen.
      if (
        previousFocus &&
        previousFocus !== document.body &&
        typeof previousFocus.focus === 'function' &&
        (!activeDialogStack.length ||
          activeDialogStack.some((activeDialog) => activeDialog.contains(previousFocus)))
      ) {
        requestAnimationFrame(() => {
          if (
            !document.body.contains(dialog) &&
            (!activeDialogStack.length ||
              activeDialogStack.some((activeDialog) => activeDialog.contains(previousFocus)))
          ) {
            previousFocus.focus();
          }
        });
      }
    };
  }, [active]);

  return dialogRef;
}
