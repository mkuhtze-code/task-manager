import { useEffect, useRef } from 'react';

export function useDialogA11y<T extends HTMLElement = HTMLElement>(
  onClose: () => void
) {
  const dialogRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);

  // Always keep the latest callback available without causing the
  // dialog lifecycle effect to restart.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Capture the element that had focus when the dialog opened.
    const previousFocus = document.activeElement as HTMLElement | null;

    const focusTarget = dialog.querySelector<HTMLElement>(
      '[data-autofocus]'
    );

    if (focusTarget) {
      requestAnimationFrame(() => {
        // Only perform initial focus if the dialog is still mounted and
        // nothing inside it has already intentionally taken focus.
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

      // Restore focus only when the dialog is actually being removed.
      // This prevents normal parent rerenders from stealing focus from
      // an active input and causing the mobile keyboard to disappear.
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
