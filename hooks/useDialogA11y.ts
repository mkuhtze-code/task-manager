import { useEffect, useRef } from 'react';

export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void
) {
  const dialogRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);

  // Keep the latest callback without restarting the dialog lifecycle effect.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Capture the element that had focus when the dialog opened.
    const previousFocus = document.activeElement as HTMLElement | null;

    // Only focus an explicitly designated initial-focus element.
    // This avoids unexpectedly stealing focus from inputs.
    const focusTarget = dialog.querySelector<HTMLElement>(
      '[data-autofocus]'
    );

    if (focusTarget) {
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
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
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
