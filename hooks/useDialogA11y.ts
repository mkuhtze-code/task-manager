import { useEffect, useRef } from 'react';

type DialogCloseHandler = () => void;

type UseDialogA11yOptions = {
  onClose: DialogCloseHandler;
  initialFocus?: boolean;
};

export function useDialogA11y<T extends HTMLElement = HTMLElement>({
  onClose,
  initialFocus = true,
}: UseDialogA11yOptions) {
  const dialogRef = useRef<T | null>(null);

  // Keep the latest callback without making the dialog lifecycle effect
  // depend on the callback's identity.
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Capture the element that opened the dialog once.
    const previousFocus = document.activeElement as HTMLElement | null;

    // Find the intended initial focus target.
    if (initialFocus) {
      const focusTarget = dialog.querySelector<HTMLElement>(
        '[data-autofocus], input, textarea, select, button'
      );

      if (focusTarget) {
        requestAnimationFrame(() => {
          // Only focus if the dialog is still mounted and nothing else
          // has intentionally taken focus.
          if (
            document.body.contains(dialog) &&
            !dialog.contains(document.activeElement)
          ) {
            focusTarget.focus();
          }
        });
      }
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
      // Do NOT do this when onClose changes identity or the parent rerenders.
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
  }, [initialFocus]);

  return dialogRef;
}
