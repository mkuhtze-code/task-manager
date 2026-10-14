import { useEffect, useRef } from 'react';

type DialogA11yOptions = {
  /** Modal sheets trap keyboard focus; non-modal desktop panes do not. */
  trapFocus?: boolean;
};

export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  options: DialogA11yOptions = {},
) {
  const dialogRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  const trapFocusRef = useRef(options.trapFocus ?? true);

  // Keep current callbacks and presentation mode without restarting the dialog lifecycle.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  trapFocusRef.current = options.trapFocus ?? true;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Capture the element that had focus when the dialog opened.
    const previousFocus = document.activeElement as HTMLElement | null;

    // Only focus an explicitly designated initial-focus element.
    // This avoids unexpectedly stealing focus from inputs.
    const focusTarget = dialog.querySelector<HTMLElement>('[data-autofocus]');

    if (focusTarget) {
      requestAnimationFrame(() => {
        const activeDialog = dialogRef.current;
        if (
          activeDialog &&
          document.body.contains(activeDialog) &&
          !activeDialog.contains(document.activeElement)
        ) {
          focusTarget.focus();
        }
      });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !trapFocusRef.current) return;

      const activeDialog = dialogRef.current;
      if (!activeDialog) return;

      const focusable = Array.from(
        activeDialog.querySelectorAll<HTMLElement>(
          'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([type="hidden"]):not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), [contenteditable="true"]:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
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
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (!first || !last) {
        event.preventDefault();
        activeDialog.setAttribute('tabindex', '-1');
        activeDialog.focus();
        return;
      }

      const focusIsOutside = !activeDialog.contains(activeElement);
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

      // Restore focus only when the dialog has actually been removed.
      // Do not steal focus during normal parent rerenders.
      if (
        previousFocus &&
        previousFocus !== document.body &&
        typeof previousFocus.focus === 'function'
      ) {
        requestAnimationFrame(() => {
          if (!document.body.contains(dialog)) {
            previousFocus.focus();
          }
        });
      }
    };
  }, []);

  return dialogRef;
}
