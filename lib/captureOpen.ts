/** Desktop primary action (Dock it / Add …) shared across chrome and pages. */

export type DesktopPrimaryAction = {
  label: string;
  run: () => void;
};

let action: DesktopPrimaryAction | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function registerDesktopPrimaryAction(
  label: string,
  run: () => void
): () => void {
  const prev = action;
  // Reuse the same snapshot object when label is unchanged and only the
  // function identity changed from a re-register — still need new run.
  action = { label, run };
  if (!prev || prev.label !== label || prev.run !== run) {
    notify();
  }
  return () => {
    if (action?.run === run) {
      action = null;
      notify();
    }
  };
}

export function getDesktopPrimaryAction(): DesktopPrimaryAction | null {
  return action;
}

export function subscribeDesktopPrimaryAction(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Back-compat: Today page registers capture as primary "Dock it". */
export function registerCaptureOpen(fn: () => void): () => void {
  return registerDesktopPrimaryAction('Dock it', fn);
}

export function requestCaptureOpen(): void {
  action?.run();
}
